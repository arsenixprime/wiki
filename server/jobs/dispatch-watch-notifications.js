const _ = require('lodash')
const workflow = require('../helpers/workflow')
const subjects = require('../helpers/subjects')

/* global WIKI */

/**
 * Dispatch Watch Notifications (debounce drain)
 *
 * Runs on the scheduler's finest cadence. For every page with pending,
 * not-yet-notified published changes whose quiet period has elapsed, it sends
 * ONE consolidated digest email covering lastNotifiedVersionId -> current, to
 * every watcher (groups expanded + de-duplicated) EXCEPT the last editor, then
 * clears the queue row. Further edits during the quiet period simply push
 * lastChangeAt forward, so this coalesces bursts into a single email.
 */
module.exports = async () => {
  WIKI.logger.info('Dispatching pending watch notifications...')
  try {
    const pendingRows = await WIKI.models.pagePendingNotifications.query()
    if (pendingRows.length < 1) {
      WIKI.logger.info('No pending watch notifications: [ COMPLETED ]')
      return
    }

    const now = Date.now()
    let sentCount = 0

    for (const row of pendingRows) {
      const page = await WIKI.models.pages.query().findById(row.pageId)
      if (!page) {
        // Page was deleted — drop the orphaned queue row.
        await WIKI.models.pagePendingNotifications.query().deleteById(row.id)
        continue
      }

      // -> Respect the per-page (or site default) debounce delay.
      const delayMins = await workflow.getEffectiveDelayMins(page)
      const elapsedMs = now - Date.parse(row.lastChangeAt)
      if (elapsedMs < delayMins * 60000) {
        continue // still within the quiet period
      }

      // -> Resolve recipients (live group expansion + dedup), minus the author.
      const watcherRows = await WIKI.models.pageWatchers.getByPage(page.id)
      const watchers = await subjects.resolveSubjectsToUsers(watcherRows)
      const recipients = watchers.filter(u => u.id !== page.authorId)

      // -> Build the change summary from the last-notified version to current.
      const currentRevisionId = await workflow.getCurrentRevisionId(page.id)
      let previousContent = ''
      if (row.lastNotifiedVersionId) {
        const baseVersion = await WIKI.models.pageHistory.getVersion({
          pageId: page.id,
          versionId: row.lastNotifiedVersionId
        })
        previousContent = _.get(baseVersion, 'content', '')
      }
      const stats = workflow.computeChangeStats(previousContent, page.content)
      const author = await WIKI.models.users.query().findById(page.authorId).select('name')
      const authorName = _.get(author, 'name', 'Someone')

      for (const rcpt of recipients) {
        await workflow._send('workflowWatchDigest', rcpt.email, `Page updated: ${page.title}`, {
          preheadertext: `${authorName} updated "${page.title}"`,
          title: `Page updated: ${page.title}`,
          pageTitle: page.title,
          pagePath: page.path,
          changedBy: authorName,
          statsLine: workflow.statsLine(stats),
          intro: `${authorName} published changes to a page you are watching.`,
          buttonText: 'View page',
          buttonLink: workflow.pageUrl(page),
          diffLink: workflow.diffUrl(page, row.lastNotifiedVersionId, currentRevisionId)
        })
      }

      // -> Clear the queue row; the next change re-creates it with a fresh
      //    baseline so successive digests never overlap or repeat.
      await WIKI.models.pagePendingNotifications.query().deleteById(row.id)
      sentCount++
    }

    WIKI.logger.info(`Dispatched watch notifications for ${sentCount} page(s): [ COMPLETED ]`)
  } catch (err) {
    WIKI.logger.error('Failed to dispatch watch notifications: [ FAILED ]')
    WIKI.logger.error(err.message)
  }
}
