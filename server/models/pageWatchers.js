const Model = require('objection').Model

/* global WIKI */

/**
 * Page Watchers model
 *
 * A watcher is a subscription to a page's published-content changes. Each row
 * targets EITHER a user OR a group (enforced by the application layer, see
 * server/helpers/subjects.js). Groups are expanded to live membership when
 * notifications are dispatched.
 */
module.exports = class PageWatcher extends Model {
  static get tableName() { return 'pageWatchers' }

  static get jsonSchema () {
    return {
      type: 'object',
      required: ['pageId'],
      properties: {
        id: {type: 'integer'},
        pageId: {type: 'integer'},
        userId: {type: ['integer', 'null']},
        groupId: {type: ['integer', 'null']},
        createdAt: {type: 'string'}
      }
    }
  }

  static get relationMappings() {
    return {
      page: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./pages'),
        join: { from: 'pageWatchers.pageId', to: 'pages.id' }
      },
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./users'),
        join: { from: 'pageWatchers.userId', to: 'users.id' }
      },
      group: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./groups'),
        join: { from: 'pageWatchers.groupId', to: 'groups.id' }
      }
    }
  }

  $beforeInsert() {
    this.createdAt = new Date().toISOString()
  }

  static async getByPage (pageId) {
    return WIKI.models.pageWatchers.query().where('pageId', pageId)
  }
}
