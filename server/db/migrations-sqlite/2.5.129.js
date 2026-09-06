/* global WIKI */

// =====================================
// Corporate documentation workflow
// (Watch / Managed pages / Review-Approve)
// =====================================

exports.up = async knex => {
  const dbCompat = {
    charset: (WIKI.config.db.type === `mysql` || WIKI.config.db.type === `mariadb`)
  }

  // A watcher / manager / approver subject is EITHER a user OR a group
  // (exactly one of userId / groupId is non-null). The application layer
  // enforces the XOR and expands groups to their live membership at
  // evaluation time (see server/helpers/subjects.js).
  const subjectTable = tableName => knex.schema.createTable(tableName, table => {
    if (dbCompat.charset) { table.charset('utf8mb4') }
    table.increments('id').primary()
    table.integer('pageId').unsigned().notNullable().references('id').inTable('pages').onDelete('CASCADE')
    table.integer('userId').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('groupId').unsigned().nullable().references('id').inTable('groups').onDelete('CASCADE')
    table.string('createdAt').notNullable()
  })

  await subjectTable('pageWatchers')
  await subjectTable('pageManagers')
  await subjectTable('pageApprovers')

  // Drafts of managed pages. A draft is a full editable copy that never
  // touches the live page or its history until it is published.
  await knex.schema.createTable('pageDrafts', table => {
    if (dbCompat.charset) { table.charset('utf8mb4') }
    table.increments('id').primary()
    table.integer('pageId').unsigned().notNullable().references('id').inTable('pages').onDelete('CASCADE')
    table.text('content')
    table.string('editorKey')
    table.string('title')
    table.string('description')
    table.enum('status', ['open', 'submitted']).notNullable().defaultTo('open')
    table.integer('createdBy').unsigned().references('id').inTable('users')
    table.integer('updatedBy').unsigned().references('id').inTable('users')
    table.integer('submittedBy').unsigned().nullable().references('id').inTable('users')
    table.string('submittedAt').nullable()
    table.string('createdAt').notNullable()
    table.string('updatedAt').notNullable()
  })

  // Per-revision approvals. Each row records which pageHistory version a
  // given user approved. Approvals are never mutated on re-publish; the
  // "current" approval state is derived by comparing to the latest version.
  await knex.schema.createTable('pageApprovals', table => {
    if (dbCompat.charset) { table.charset('utf8mb4') }
    table.increments('id').primary()
    table.integer('pageId').unsigned().notNullable().references('id').inTable('pages').onDelete('CASCADE')
    table.integer('userId').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('approvedVersionId').unsigned().notNullable().comment('pageHistory.id that was approved')
    table.string('approvedAt').notNullable()
  })

  // Debounce queue for watch notifications. One row per page with pending,
  // not-yet-notified changes. The dispatch-watch-notifications job drains it.
  await knex.schema.createTable('pagePendingNotifications', table => {
    if (dbCompat.charset) { table.charset('utf8mb4') }
    table.increments('id').primary()
    table.integer('pageId').unsigned().notNullable().unique().references('id').inTable('pages').onDelete('CASCADE')
    table.string('firstChangeAt').notNullable()
    table.string('lastChangeAt').notNullable()
    table.integer('lastNotifiedVersionId').unsigned().nullable().comment('pageHistory.id last covered by an email')
  })

  // New page-level workflow columns.
  await knex.schema.alterTable('pages', table => {
    table.boolean('isManaged').notNullable().defaultTo(false)
    table.enum('approvalMode', ['off', 'review', 'approve']).notNullable().defaultTo('off')
    table.integer('watchNotifyDelayMins').unsigned().nullable().comment('null falls back to the site default')
  })
}

exports.down = async knex => {
  await knex.schema.alterTable('pages', table => {
    table.dropColumn('isManaged')
    table.dropColumn('approvalMode')
    table.dropColumn('watchNotifyDelayMins')
  })
  await knex.schema.dropTableIfExists('pagePendingNotifications')
  await knex.schema.dropTableIfExists('pageApprovals')
  await knex.schema.dropTableIfExists('pageDrafts')
  await knex.schema.dropTableIfExists('pageApprovers')
  await knex.schema.dropTableIfExists('pageManagers')
  await knex.schema.dropTableIfExists('pageWatchers')
}
