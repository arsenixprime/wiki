const Model = require('objection').Model

/* global WIKI */

/**
 * Page Approvals model
 *
 * Records, per revision, which pageHistory version each user approved.
 * Approvals are never mutated when a page is re-published — the current
 * approval state is derived by comparing each user's most recent approved
 * version to the page's latest version. This is what makes "adding a user to
 * an approver group can un-approve a page" the correct, intended behavior.
 */
module.exports = class PageApproval extends Model {
  static get tableName() { return 'pageApprovals' }

  static get jsonSchema () {
    return {
      type: 'object',
      required: ['pageId', 'userId', 'approvedVersionId'],
      properties: {
        id: {type: 'integer'},
        pageId: {type: 'integer'},
        userId: {type: 'integer'},
        approvedVersionId: {type: 'integer'},
        approvedAt: {type: 'string'}
      }
    }
  }

  static get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./users'),
        join: { from: 'pageApprovals.userId', to: 'users.id' }
      }
    }
  }

  $beforeInsert() {
    this.approvedAt = new Date().toISOString()
  }

  static async getByPage (pageId) {
    return WIKI.models.pageApprovals.query().where('pageId', pageId)
  }

  /**
   * Record (or refresh) a user's approval of a specific version.
   */
  static async record ({ pageId, userId, approvedVersionId }) {
    const existing = await WIKI.models.pageApprovals.query()
      .where({ pageId, userId }).first()
    if (existing) {
      return WIKI.models.pageApprovals.query()
        .patch({ approvedVersionId, approvedAt: new Date().toISOString() })
        .where('id', existing.id)
    }
    return WIKI.models.pageApprovals.query().insert({ pageId, userId, approvedVersionId })
  }
}
