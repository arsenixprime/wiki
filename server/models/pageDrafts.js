const Model = require('objection').Model

/* global WIKI */

/**
 * Page Drafts model
 *
 * A draft is a full, editable copy of a managed page's content + metadata that
 * lives entirely separate from the live page and its history until it is
 * published. Creating and editing drafts never triggers watch or approval
 * notifications.
 */
module.exports = class PageDraft extends Model {
  static get tableName() { return 'pageDrafts' }

  static get jsonSchema () {
    return {
      type: 'object',
      required: ['pageId'],
      properties: {
        id: {type: 'integer'},
        pageId: {type: 'integer'},
        content: {type: 'string'},
        editorKey: {type: 'string'},
        title: {type: 'string'},
        description: {type: 'string'},
        status: {type: 'string'},
        createdBy: {type: 'integer'},
        updatedBy: {type: 'integer'},
        submittedBy: {type: ['integer', 'null']},
        submittedAt: {type: ['string', 'null']},
        createdAt: {type: 'string'},
        updatedAt: {type: 'string'}
      }
    }
  }

  static get relationMappings() {
    return {
      page: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./pages'),
        join: { from: 'pageDrafts.pageId', to: 'pages.id' }
      },
      author: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./users'),
        join: { from: 'pageDrafts.updatedBy', to: 'users.id' }
      },
      creator: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./users'),
        join: { from: 'pageDrafts.createdBy', to: 'users.id' }
      }
    }
  }

  $beforeInsert() {
    this.createdAt = new Date().toISOString()
    this.updatedAt = new Date().toISOString()
  }
  $beforeUpdate() {
    this.updatedAt = new Date().toISOString()
  }

  static async getByPage (pageId) {
    return WIKI.models.pageDrafts.query()
      .where('pageId', pageId)
      .withGraphFetched('author(selectBasic)')
      .withGraphFetched('creator(selectBasic)')
      .modifiers({
        selectBasic: builder => builder.select('id', 'name', 'email')
      })
      .orderBy('updatedAt', 'desc')
  }
}
