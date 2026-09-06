const _ = require('lodash')
const graphHelper = require('../../helpers/graph')
const subjects = require('../../helpers/subjects')
const workflow = require('../../helpers/workflow')

/* global WIKI */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadPage (pageId) {
  const page = await WIKI.models.pages.query().findById(pageId)
  if (!page) { throw new WIKI.Error.PageNotFound() }
  return page
}

function canReadPage (user, page) {
  return WIKI.auth.checkAccess(user, ['read:pages'], { path: page.path, locale: page.localeCode })
}

// A user may "manage" a page if they hold manage:pages on it (admins included
// via manage:system short-circuit) OR they are an assigned page manager.
async function canManagePage (user, page) {
  if (WIKI.auth.checkAccess(user, ['manage:pages'], { path: page.path, locale: page.localeCode })) {
    return true
  }
  return WIKI.models.pageManagers.isManager(page.id, user.id)
}

// Replace the full subject set of a page for a given subject model.
async function replaceSubjects (model, pageId, inputSubjects) {
  const rows = (inputSubjects || []).map(s => {
    subjects.validateSubject(s)
    return { pageId, userId: _.isNil(s.userId) ? null : s.userId, groupId: _.isNil(s.groupId) ? null : s.groupId }
  })
  await model.query().where('pageId', pageId).del()
  if (rows.length > 0) {
    await model.query().insert(rows)
  }
}

// Resolve subject rows into display objects (user or group, with names).
async function toDisplaySubjects (rows) {
  const userIds = rows.filter(r => !_.isNil(r.userId)).map(r => r.userId)
  const groupIds = rows.filter(r => !_.isNil(r.groupId)).map(r => r.groupId)
  const users = userIds.length ? await WIKI.models.users.query().select('id', 'name', 'email').whereIn('id', userIds) : []
  const groups = groupIds.length ? await WIKI.models.groups.query().select('id', 'name').whereIn('id', groupIds) : []
  const usersById = _.keyBy(users, 'id')
  const groupsById = _.keyBy(groups, 'id')
  return rows.map(r => {
    if (!_.isNil(r.userId)) {
      const u = usersById[r.userId] || {}
      return { id: r.id, kind: 'user', userId: r.userId, groupId: null, name: u.name || `User #${r.userId}`, email: u.email || null }
    }
    const g = groupsById[r.groupId] || {}
    return { id: r.id, kind: 'group', userId: null, groupId: r.groupId, name: g.name || `Group #${r.groupId}`, email: null }
  })
}

module.exports = {
  PageQuery: {
    // --- Watch -------------------------------------------------------------
    async watchers (obj, args, context) {
      const page = await loadPage(args.pageId)
      if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
      return toDisplaySubjects(await WIKI.models.pageWatchers.getByPage(page.id))
    },
    async isWatching (obj, args, context) {
      const row = await WIKI.models.pageWatchers.query()
        .where({ pageId: args.pageId, userId: context.req.user.id }).first()
      return !!row
    },
    // --- Managed pages -----------------------------------------------------
    async managers (obj, args, context) {
      const page = await loadPage(args.pageId)
      if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
      return toDisplaySubjects(await WIKI.models.pageManagers.getByPage(page.id))
    },
    async drafts (obj, args, context) {
      const page = await loadPage(args.pageId)
      if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
      const rows = await WIKI.models.pageDrafts.getByPage(page.id)
      return rows.map(d => ({
        ...d,
        createdByName: _.get(d, 'creator.name', null),
        updatedByName: _.get(d, 'author.name', null)
      }))
    },
    async draft (obj, args, context) {
      const draft = await WIKI.models.pageDrafts.query().findById(args.id)
      if (!draft) { return null }
      const page = await loadPage(draft.pageId)
      if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
      return draft
    },
    // --- Review / Approve --------------------------------------------------
    async approvers (obj, args, context) {
      const page = await loadPage(args.pageId)
      if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
      return toDisplaySubjects(await WIKI.models.pageApprovers.getByPage(page.id))
    },
    async approvalStatus (obj, args, context) {
      const page = await loadPage(args.pageId)
      if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
      return workflow.computeApprovalStatus(page.id)
    },
    async workflowState (obj, args, context) {
      const page = await loadPage(args.pageId)
      if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
      const watching = await WIKI.models.pageWatchers.query()
        .where({ pageId: page.id, userId: context.req.user.id }).first()
      return {
        isManaged: !!page.isManaged,
        approvalMode: page.approvalMode || 'off',
        watchNotifyDelayMins: _.isFinite(page.watchNotifyDelayMins) ? page.watchNotifyDelayMins : null,
        effectiveDelayMins: await workflow.getEffectiveDelayMins(page),
        isWatching: !!watching,
        canManage: await canManagePage(context.req.user, page)
      }
    },
    async assignableGroups (obj, args, context) {
      return WIKI.models.groups.query().select('id', 'name').orderBy('name')
    }
  },

  PageMutation: {
    // =====================================================================
    // FEATURE 1 — WATCH
    // =====================================================================
    async watch (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
        const existing = await WIKI.models.pageWatchers.query()
          .where({ pageId: page.id, userId: context.req.user.id }).first()
        if (!existing) {
          await WIKI.models.pageWatchers.query().insert({ pageId: page.id, userId: context.req.user.id, groupId: null })
        }
        return { responseResult: graphHelper.generateSuccess('Now watching page.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async unwatch (obj, args, context) {
      try {
        await WIKI.models.pageWatchers.query()
          .where({ pageId: args.pageId, userId: context.req.user.id }).del()
        return { responseResult: graphHelper.generateSuccess('No longer watching page.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async setWatchers (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        // Assigning OTHER users/groups requires page-management rights.
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        await replaceSubjects(WIKI.models.pageWatchers, page.id, args.subjects)
        return { responseResult: graphHelper.generateSuccess('Watchers updated.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async setWatchDelay (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        await WIKI.models.pages.query()
          .patch({ watchNotifyDelayMins: _.isFinite(args.delayMins) ? args.delayMins : null })
          .where('id', page.id)
        return { responseResult: graphHelper.generateSuccess('Watch delay updated.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },

    // =====================================================================
    // FEATURE 2 — MANAGED PAGES
    // =====================================================================
    async setManaged (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        await WIKI.models.pages.query().patch({ isManaged: args.isManaged }).where('id', page.id)
        return { responseResult: graphHelper.generateSuccess('Managed flag updated.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async setManagers (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        await replaceSubjects(WIKI.models.pageManagers, page.id, args.subjects)
        return { responseResult: graphHelper.generateSuccess('Managers updated.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async createDraft (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        // Any user with read access may create a draft of a managed page.
        if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
        const draft = await WIKI.models.pageDrafts.query().insertAndFetch({
          pageId: page.id,
          content: _.isNil(args.content) ? page.content : args.content,
          editorKey: args.editorKey || page.editorKey,
          title: _.isNil(args.title) ? page.title : args.title,
          description: _.isNil(args.description) ? page.description : args.description,
          status: 'open',
          createdBy: context.req.user.id,
          updatedBy: context.req.user.id
        })
        return { responseResult: graphHelper.generateSuccess('Draft created.'), draft }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async updateDraft (obj, args, context) {
      try {
        const draft = await WIKI.models.pageDrafts.query().findById(args.id)
        if (!draft) { throw new WIKI.Error.PageNotFound() }
        const page = await loadPage(draft.pageId)
        // DELIBERATE (per spec): drafts are collaborative — ANY user with read
        // access to the page may edit ANY draft on it, not just its creator.
        if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
        const patch = { updatedBy: context.req.user.id }
        if (!_.isNil(args.content)) { patch.content = args.content }
        if (!_.isNil(args.editorKey)) { patch.editorKey = args.editorKey }
        if (!_.isNil(args.title)) { patch.title = args.title }
        if (!_.isNil(args.description)) { patch.description = args.description }
        await WIKI.models.pageDrafts.query().patch(patch).where('id', draft.id)
        return { responseResult: graphHelper.generateSuccess('Draft updated.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async deleteDraft (obj, args, context) {
      try {
        const draft = await WIKI.models.pageDrafts.query().findById(args.id)
        if (!draft) { throw new WIKI.Error.PageNotFound() }
        const page = await loadPage(draft.pageId)
        // DELIBERATE (per spec): any user with read access may delete any draft.
        if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
        await WIKI.models.pageDrafts.query().deleteById(draft.id)
        return { responseResult: graphHelper.generateSuccess('Draft deleted.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async submitDraft (obj, args, context) {
      try {
        const draft = await WIKI.models.pageDrafts.query().findById(args.id)
        if (!draft) { throw new WIKI.Error.PageNotFound() }
        const page = await loadPage(draft.pageId)
        if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
        await WIKI.models.pageDrafts.query().patch({
          status: 'submitted',
          submittedBy: context.req.user.id,
          submittedAt: new Date().toISOString(),
          updatedBy: context.req.user.id
        }).where('id', draft.id)
        // Notify managers (does NOT trigger watch/approval notifications).
        await workflow.notifyDraftSubmitted({ page, draft, submitter: context.req.user })
        return { responseResult: graphHelper.generateSuccess('Draft submitted for review.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async publishDraft (obj, args, context) {
      try {
        const draft = await WIKI.models.pageDrafts.query().findById(args.id)
        if (!draft) { throw new WIKI.Error.PageNotFound() }
        const page = await loadPage(draft.pageId)
        // Only managers/admins may publish a draft to the live page.
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }

        // Reuse the live page's current tags (drafts do not track tags).
        const tagged = await WIKI.models.pages.query().findById(page.id).withGraphFetched('tags')
        const tags = _.map(_.get(tagged, 'tags', []), 'tag')

        // Apply through the normal save pipeline so history, search, storage
        // and watch/approval side-effects all fire exactly once.
        await WIKI.models.pages.updatePage({
          id: page.id,
          content: draft.content,
          description: _.isNil(draft.description) ? page.description : draft.description,
          title: _.isNil(draft.title) ? page.title : draft.title,
          isPublished: true,
          isPrivate: page.isPrivate,
          locale: page.localeCode,
          path: page.path,
          publishStartDate: page.publishStartDate || '',
          publishEndDate: page.publishEndDate || '',
          tags,
          user: context.req.user, // acting (publishing) user — passes access checks
          authorId: draft.submittedBy || draft.updatedBy || draft.createdBy, // recorded content author = submitter
          isDraftPublish: true, // bypasses the managed-page direct-save guard
          action: 'updated'
        })
        await WIKI.models.pageDrafts.query().deleteById(draft.id)
        return { responseResult: graphHelper.generateSuccess('Draft published.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async rejectDraft (obj, args, context) {
      try {
        const draft = await WIKI.models.pageDrafts.query().findById(args.id)
        if (!draft) { throw new WIKI.Error.PageNotFound() }
        const page = await loadPage(draft.pageId)
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        const submitterUser = draft.submittedBy ?
          await WIKI.models.users.query().findById(draft.submittedBy).select('id', 'name', 'email') :
          null
        await WIKI.models.pageDrafts.query().patch({
          status: 'open',
          submittedBy: null,
          submittedAt: null
        }).where('id', draft.id)
        await workflow.notifyDraftRejected({ page, draft, manager: context.req.user, comment: args.comment, submitterUser })
        return { responseResult: graphHelper.generateSuccess('Draft returned to author.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },

    // =====================================================================
    // FEATURE 3 — REVIEW / APPROVE
    // =====================================================================
    async setApprovalMode (obj, args, context) {
      try {
        if (!['off', 'review', 'approve'].includes(args.mode)) {
          throw new WIKI.Error.InputInvalid('Invalid approval mode.')
        }
        const page = await loadPage(args.pageId)
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        await WIKI.models.pages.query().patch({ approvalMode: args.mode }).where('id', page.id)
        return { responseResult: graphHelper.generateSuccess('Approval mode updated.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async setApprovers (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        if (!await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        await replaceSubjects(WIKI.models.pageApprovers, page.id, args.subjects)
        return { responseResult: graphHelper.generateSuccess('Approvers updated.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async requestApproval (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        // Author (write:pages) or a manager may manually request approval.
        const canWrite = WIKI.auth.checkAccess(context.req.user, ['write:pages'], { path: page.path, locale: page.localeCode })
        if (!canWrite && !await canManagePage(context.req.user, page)) { throw new WIKI.Error.PageUpdateForbidden() }
        if (!page.approvalMode || page.approvalMode === 'off') {
          throw new WIKI.Error.InputInvalid('Approval is not enabled on this page.')
        }
        await workflow.requestApproval({ page, authorId: page.authorId })
        return { responseResult: graphHelper.generateSuccess('Approval requested.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async approve (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
        // Server-side: the acting user must currently be an approver (live group
        // expansion), otherwise the approval is rejected.
        const approverRows = await WIKI.models.pageApprovers.getByPage(page.id)
        const approverIds = await subjects.resolveSubjectUserIds(approverRows)
        if (!approverIds.has(context.req.user.id)) { throw new WIKI.Error.PageUpdateForbidden() }
        const currentRevisionId = await workflow.getCurrentRevisionId(page.id)
        await WIKI.models.pageApprovals.record({
          pageId: page.id,
          userId: context.req.user.id,
          approvedVersionId: currentRevisionId
        })
        return { responseResult: graphHelper.generateSuccess('Page approved.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    },
    async requestChanges (obj, args, context) {
      try {
        const page = await loadPage(args.pageId)
        if (!canReadPage(context.req.user, page)) { throw new WIKI.Error.PageViewForbidden() }
        // Recipients: the last editor + all managers (deduped).
        const recipients = []
        if (page.authorId) {
          const editor = await WIKI.models.users.query().findById(page.authorId).select('id', 'name', 'email')
          if (editor) { recipients.push(editor) }
        }
        const managerRows = await WIKI.models.pageManagers.getByPage(page.id)
        const managers = await subjects.resolveSubjectsToUsers(managerRows)
        const merged = _.uniqBy([...recipients, ...managers], 'id')
        await workflow.notifyChangesRequested({ page, requester: context.req.user, comment: args.comment, recipients: merged })
        return { responseResult: graphHelper.generateSuccess('Changes requested.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    }
  }
}
