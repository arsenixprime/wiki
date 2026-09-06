const Model = require('objection').Model

/* global WIKI */

/**
 * Page Pending Notifications model (watch-notification debounce queue)
 *
 * One row per page that has published changes not yet emailed to watchers.
 * Each publish upserts the row (pushing lastChangeAt forward); the
 * dispatch-watch-notifications job drains rows whose quiet period has elapsed,
 * sending ONE consolidated email covering lastNotifiedVersionId -> current.
 */
module.exports = class PagePendingNotification extends Model {
  static get tableName() { return 'pagePendingNotifications' }

  static get jsonSchema () {
    return {
      type: 'object',
      required: ['pageId', 'firstChangeAt', 'lastChangeAt'],
      properties: {
        id: {type: 'integer'},
        pageId: {type: 'integer'},
        firstChangeAt: {type: 'string'},
        lastChangeAt: {type: 'string'},
        lastNotifiedVersionId: {type: ['integer', 'null']}
      }
    }
  }

  /**
   * Record a published change for a page, resetting the debounce timer.
   * @param {number} pageId
   * @param {number|null} baselineVersionId the version that watchers were last
   *        notified about (only stored when creating a fresh row, so a
   *        consolidated email spans from the last notified version).
   */
  static async enqueue (pageId, baselineVersionId = null) {
    const now = new Date().toISOString()
    const existing = await WIKI.models.pagePendingNotifications.query()
      .where('pageId', pageId).first()
    if (existing) {
      // Further edits during the quiet period just push lastChangeAt forward.
      await WIKI.models.pagePendingNotifications.query()
        .patch({ lastChangeAt: now })
        .where('id', existing.id)
    } else {
      await WIKI.models.pagePendingNotifications.query().insert({
        pageId,
        firstChangeAt: now,
        lastChangeAt: now,
        lastNotifiedVersionId: baselineVersionId
      })
    }
  }
}
