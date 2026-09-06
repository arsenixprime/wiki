const Model = require('objection').Model

/* global WIKI */

/**
 * Page Approvers model
 *
 * An approver is asked to review/approve each published revision. Each row
 * targets EITHER a user OR a group (see server/helpers/subjects.js). Group
 * membership is resolved live, so adding a user to an approver group makes
 * them a pending approver for the current revision immediately.
 */
module.exports = class PageApprover extends Model {
  static get tableName() { return 'pageApprovers' }

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
        join: { from: 'pageApprovers.pageId', to: 'pages.id' }
      },
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./users'),
        join: { from: 'pageApprovers.userId', to: 'users.id' }
      },
      group: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./groups'),
        join: { from: 'pageApprovers.groupId', to: 'groups.id' }
      }
    }
  }

  $beforeInsert() {
    this.createdAt = new Date().toISOString()
  }

  static async getByPage (pageId) {
    return WIKI.models.pageApprovers.query().where('pageId', pageId)
  }
}
