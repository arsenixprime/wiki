const _ = require('lodash')
const jsdiff = require('diff')
const subjects = require('./subjects')

/* global WIKI */

const DEFAULT_WATCH_DELAY_MINS = 30

/**
 * Corporate documentation workflow orchestration.
 *
 * Central home for the cross-cutting behavior shared by the Watch, Managed and
 * Approve features: delay resolution, change-stat summaries, URL building,
 * per-revision approval status, and all outbound emails. Group subjects are
 * always expanded to live membership and de-duplicated (see ./subjects).
 */
module.exports = {
  // ---------------------------------------------------------------------------
  // Wording — the ONLY place review-vs-approve terminology diverges.
  // ---------------------------------------------------------------------------
  approvalWording (mode) {
    return (mode === 'approve') ?
      { verb: 'Approve', verbLower: 'approve', past: 'Approved', pastLower: 'approved', noun: 'approval' } :
      { verb: 'Review', verbLower: 'review', past: 'Reviewed', pastLower: 'reviewed', noun: 'review' }
  },

  // ---------------------------------------------------------------------------
  // Settings / delays
  // ---------------------------------------------------------------------------
  async getWatchDelayDefault () {
    const row = await WIKI.models.settings.query().findById('workflow')
    const val = _.get(row, 'value.watchNotifyDelayDefault', null)
    return _.isFinite(val) ? val : DEFAULT_WATCH_DELAY_MINS
  },

  async getEffectiveDelayMins (page) {
    if (_.isFinite(page.watchNotifyDelayMins)) { return page.watchNotifyDelayMins }
    return this.getWatchDelayDefault()
  },

  // ---------------------------------------------------------------------------
  // URLs (respect the configured site base URL)
  // ---------------------------------------------------------------------------
  pageUrl (page) {
    return `${WIKI.config.host}/${page.localeCode || page.locale}/${page.path}`
  },
  historyUrl (page) {
    return `${WIKI.config.host}/h/${page.localeCode || page.locale}/${page.path}`
  },
  diffUrl (page, fromVersionId, toVersionId) {
    return `${this.historyUrl(page)}?diff=${fromVersionId || 0},${toVersionId || 0}`
  },
  draftReviewUrl (page, draftId) {
    // The draft review UI is a modal on the page itself, auto-opened via query.
    return `${this.pageUrl(page)}?wfdraft=${draftId}`
  },

  // ---------------------------------------------------------------------------
  // Revisions & change stats
  // ---------------------------------------------------------------------------
  /**
   * Monotonic id of the page's current revision. Each publish adds exactly one
   * pageHistory row, so the latest id increases by one per publish and serves
   * as a stable per-revision marker. 0 means "never revised" (freshly created).
   */
  async getCurrentRevisionId (pageId) {
    const row = await WIKI.models.pageHistory.query().where('pageId', pageId).max('id as maxId').first()
    return (row && row.maxId) ? row.maxId : 0
  },

  /**
   * Compute a compact change summary between two content strings.
   * @returns {{added:number, removed:number, sections:number}}
   */
  computeChangeStats (oldContent, newContent) {
    const parts = jsdiff.diffLines(oldContent || '', newContent || '')
    let added = 0
    let removed = 0
    let sections = 0
    for (const part of parts) {
      if (!part.added && !part.removed) { continue }
      const lines = part.count || (part.value ? part.value.split('\n').filter(l => l.length > 0).length : 0)
      if (part.added) { added += lines }
      if (part.removed) { removed += lines }
      sections++
    }
    return { added, removed, sections }
  },

  statsLine (stats) {
    return `+${stats.added} / −${stats.removed} lines across ${stats.sections} section${stats.sections === 1 ? '' : 's'}`
  },

  // ---------------------------------------------------------------------------
  // Approval status (per-revision, groups resolved live)
  // ---------------------------------------------------------------------------
  /**
   * Derive the current approval state of a page.
   * @returns {{mode, currentRevisionId, total, approvedCount, isComplete, approvers:[{userId,name,email,approved,approvedVersionId,approvedAt}]}}
   */
  async computeApprovalStatus (pageId) {
    const page = await WIKI.models.pages.query().findById(pageId).select('id', 'approvalMode')
    const mode = _.get(page, 'approvalMode', 'off')
    const currentRevisionId = await this.getCurrentRevisionId(pageId)

    const approverRows = await WIKI.models.pageApprovers.getByPage(pageId)
    const users = await subjects.resolveSubjectsToUsers(approverRows)

    const approvals = await WIKI.models.pageApprovals.getByPage(pageId)
    const approvalByUser = _.keyBy(approvals, 'userId')

    const approvers = users.map(u => {
      const a = approvalByUser[u.id]
      // "Approved the current revision" means their approved version matches
      // the page's latest revision. Any later publish moves currentRevisionId
      // forward and silently un-approves them — this is intended.
      const approved = !!a && a.approvedVersionId === currentRevisionId
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        approved,
        approvedVersionId: a ? a.approvedVersionId : null,
        approvedAt: a ? a.approvedAt : null
      }
    })

    const approvedCount = approvers.filter(a => a.approved).length
    return {
      mode,
      currentRevisionId,
      total: approvers.length,
      approvedCount,
      // A page with zero approvers is never "complete" (nothing to approve).
      isComplete: mode === 'approve' && approvers.length > 0 && approvedCount === approvers.length,
      approvers
    }
  },

  // ---------------------------------------------------------------------------
  // Publish-time hook: called once per publish of a live page.
  // ---------------------------------------------------------------------------
  /**
   * Fire watch + approval side-effects for a single publish. Best-effort:
   * never allowed to fail the page save.
   * @param {Object} opts { page, previousContent, authorId }
   */
  async onPagePublished ({ page, previousContent, authorId }) {
    try {
      if (!page || !page.isPublished) { return }

      // --- Watch: enqueue a debounced notification (one row per page) ---
      const watchers = await WIKI.models.pageWatchers.getByPage(page.id)
      if (watchers.length > 0) {
        // Baseline = the history snapshot just created by this publish, whose
        // content is the previously-live state watchers last saw. Only applied
        // when a fresh pending row is created (subsequent edits keep it).
        const baselineVersionId = await this.getCurrentRevisionId(page.id)
        await WIKI.models.pagePendingNotifications.enqueue(page.id, baselineVersionId)
      }

      // --- Approve: one approval-request cycle per publish ---
      if (page.approvalMode && page.approvalMode !== 'off') {
        await this.requestApproval({ page, authorId })
      }
    } catch (err) {
      WIKI.logger.warn(`Workflow post-publish hook failed for page ${_.get(page, 'id')}: ${err.message}`)
    }
  },

  // ---------------------------------------------------------------------------
  // Approval request emails (first-time vs delta)
  // ---------------------------------------------------------------------------
  async requestApproval ({ page, authorId }) {
    const wording = this.approvalWording(page.approvalMode)
    const currentRevisionId = await this.getCurrentRevisionId(page.id)

    const approverRows = await WIKI.models.pageApprovers.getByPage(page.id)
    const users = await subjects.resolveSubjectsToUsers(approverRows)
    if (users.length < 1) { return }

    const approvals = await WIKI.models.pageApprovals.getByPage(page.id)
    const approvalByUser = _.keyBy(approvals, 'userId')
    const author = await WIKI.models.users.query().findById(authorId).select('name')
    const authorName = _.get(author, 'name', 'Someone')

    for (const u of users) {
      const prior = approvalByUser[u.id]
      const isDelta = !!prior && prior.approvedVersionId !== currentRevisionId
      await this._send('workflowApprovalRequested', u.email, `${wording.noun} requested: ${page.title}`, {
        preheadertext: `${authorName} requests your ${wording.noun} of "${page.title}"`,
        title: `${wording.verb}: ${page.title}`,
        pageTitle: page.title,
        pagePath: page.path,
        changedBy: authorName,
        actionVerb: wording.verb,
        actionNoun: wording.noun,
        intro: isDelta ?
          `${authorName} published new changes to a page you previously ${wording.pastLower}. Please ${wording.verbLower} what changed since your last ${wording.noun}.` :
          `${authorName} is requesting your ${wording.noun} of this page.`,
        buttonText: `Open ${wording.noun} screen`,
        buttonLink: this.pageUrl(page),
        diffLink: isDelta ? this.diffUrl(page, prior.approvedVersionId, currentRevisionId) : this.historyUrl(page)
      })
    }
  },

  // ---------------------------------------------------------------------------
  // Managed-page draft emails
  // ---------------------------------------------------------------------------
  async notifyDraftSubmitted ({ page, draft, submitter }) {
    const managerRows = await WIKI.models.pageManagers.getByPage(page.id)
    const managers = await subjects.resolveSubjectsToUsers(managerRows)
    const submitterName = _.get(submitter, 'name', 'A contributor')
    for (const m of managers) {
      await this._send('workflowDraftSubmitted', m.email, `Draft submitted for review: ${page.title}`, {
        preheadertext: `${submitterName} submitted a draft of "${page.title}" for publishing`,
        title: `Draft submitted: ${page.title}`,
        pageTitle: page.title,
        pagePath: page.path,
        changedBy: submitterName,
        intro: `${submitterName} submitted a draft of this managed page for publishing. Review the changes and Publish or Reject.`,
        buttonText: 'Review draft',
        buttonLink: this.draftReviewUrl(page, draft.id),
        diffLink: this.draftReviewUrl(page, draft.id)
      })
    }
  },

  async notifyDraftRejected ({ page, draft, manager, comment, submitterUser }) {
    if (!submitterUser || !submitterUser.email) { return }
    const managerName = _.get(manager, 'name', 'A manager')
    await this._send('workflowDraftRejected', submitterUser.email, `Draft returned: ${page.title}`, {
      preheadertext: `${managerName} returned your draft of "${page.title}"`,
      title: `Draft returned: ${page.title}`,
      pageTitle: page.title,
      pagePath: page.path,
      changedBy: managerName,
      intro: `${managerName} returned your draft to Open status${comment ? ' with the following comment:' : '.'}`,
      comment: comment || '',
      buttonText: 'Open draft',
      buttonLink: this.draftReviewUrl(page, draft.id),
      diffLink: this.draftReviewUrl(page, draft.id)
    })
  },

  async notifyChangesRequested ({ page, requester, comment, recipients }) {
    const requesterName = _.get(requester, 'name', 'A reviewer')
    for (const r of recipients) {
      if (!r.email) { continue }
      await this._send('workflowChangesRequested', r.email, `Changes requested: ${page.title}`, {
        preheadertext: `${requesterName} requested changes on "${page.title}"`,
        title: `Changes requested: ${page.title}`,
        pageTitle: page.title,
        pagePath: page.path,
        changedBy: requesterName,
        intro: `${requesterName} requested changes on this page${comment ? ':' : '.'}`,
        comment: comment || '',
        buttonText: 'Open page',
        buttonLink: this.pageUrl(page),
        diffLink: this.historyUrl(page)
      })
    }
  },

  // ---------------------------------------------------------------------------
  // Internal mail wrapper (best-effort; a mis-configured mailer must not throw
  // out of a page save).
  // ---------------------------------------------------------------------------
  async _send (template, to, subject, data) {
    try {
      await WIKI.mail.send({
        template,
        to,
        subject,
        data,
        text: `${data.intro || ''}\n\n${data.pageTitle} (${data.pagePath})\n${data.buttonLink}`
      })
    } catch (err) {
      WIKI.logger.warn(`Workflow email (${template} -> ${to}) failed: ${err.message}`)
    }
  }
}
