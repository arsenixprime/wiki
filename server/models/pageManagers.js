const Model = require('objection').Model

/* global WIKI */

/**
 * Page Managers model
 *
 * A manager may publish directly to a managed page, toggle the managed flag,
 * edit the manager list, and review/publish/reject submitted drafts. Each row
 * targets EITHER a user OR a group (see server/helpers/subjects.js).
 */
module.exports = class PageManager extends Model {
  static get tableName() { return 'pageManagers' }

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
        join: { from: 'pageManagers.pageId', to: 'pages.id' }
      },
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./users'),
        join: { from: 'pageManagers.userId', to: 'users.id' }
      },
      group: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./groups'),
        join: { from: 'pageManagers.groupId', to: 'groups.id' }
      }
    }
  }

  $beforeInsert() {
    this.createdAt = new Date().toISOString()
  }

  static async getByPage (pageId) {
    return WIKI.models.pageManagers.query().where('pageId', pageId)
  }

  /**
   * Is the given user allowed to manage this page?
   * Admins (manage:system) are handled by the caller; this checks the
   * per-page manager list with live group expansion.
   */
  static async isManager (pageId, userId) {
    const rows = await WIKI.models.pageManagers.getByPage(pageId)
    const userIds = await require('../helpers/subjects').resolveSubjectUserIds(rows)
    return userIds.has(userId)
  }
}
