const _ = require('lodash')

/* global WIKI */

// Persisted mail-failure state lives in a single settings row so it survives
// restarts and is shared across HA instances. Admins are alerted until an admin
// dismisses it (which clears the row).
const SETTING_KEY = 'mailFailure'

module.exports = {
  /**
   * Record a failed email send/delivery attempt (aggregated).
   * @param {Error} err the failure
   * @param {String} context e.g. the template name that failed
   */
  async record (err, context = '') {
    try {
      const now = new Date().toISOString()
      const existing = await WIKI.models.settings.query().findById(SETTING_KEY)
      const prev = _.get(existing, 'value', null)
      const value = {
        count: (prev && _.isFinite(prev.count) ? prev.count : 0) + 1,
        firstAt: (prev && prev.firstAt) ? prev.firstAt : now,
        lastAt: now,
        lastError: _.truncate(_.get(err, 'message', String(err)), { length: 500 }),
        lastContext: _.truncate(context || '', { length: 200 })
      }
      if (existing) {
        await WIKI.models.settings.query().patch({ value }).where('key', SETTING_KEY)
      } else {
        await WIKI.models.settings.query().insert({ key: SETTING_KEY, value })
      }
    } catch (e) {
      WIKI.logger.warn(`Could not record mail-failure state: ${e.message}`)
    }
  },

  /**
   * Current mail-failure state for the admin banner.
   */
  async getState () {
    const row = await WIKI.models.settings.query().findById(SETTING_KEY)
    const v = _.get(row, 'value', null)
    if (!v || !v.count) {
      return { hasFailures: false, count: 0, firstAt: null, lastAt: null, lastError: null, lastContext: null }
    }
    return {
      hasFailures: true,
      count: v.count,
      firstAt: v.firstAt || null,
      lastAt: v.lastAt || null,
      lastError: v.lastError || null,
      lastContext: v.lastContext || null
    }
  },

  /**
   * Clear the failure state (admin acknowledged / issue resolved).
   */
  async clear () {
    await WIKI.models.settings.query().delete().where('key', SETTING_KEY)
  }
}
