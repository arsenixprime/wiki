const _ = require('lodash')

/* global WIKI */

/**
 * Workflow "subject" helpers.
 *
 * A subject is a watcher / manager / approver assignment that targets EITHER a
 * single user OR a whole group. Group membership is always resolved at
 * evaluation time (never snapshotted): if a user joins an assigned group, they
 * immediately count. A user reachable through several paths (assigned directly
 * AND via one or more groups) is de-duplicated to a single entry.
 */
module.exports = {
  /**
   * Validate that a subject targets exactly one of user / group.
   * @param {Object} subject { userId, groupId }
   */
  validateSubject (subject) {
    const hasUser = !_.isNil(subject.userId)
    const hasGroup = !_.isNil(subject.groupId)
    if (hasUser === hasGroup) {
      throw new WIKI.Error.InputInvalid('A subject must reference exactly one of userId or groupId.')
    }
  },

  /**
   * Resolve a set of subject rows to the current, de-duplicated set of user ids.
   * @param {Array} subjectRows rows with { userId, groupId }
   * @returns {Promise<Set<number>>} de-duplicated user ids
   */
  async resolveSubjectUserIds (subjectRows) {
    const userIds = new Set()
    const groupIds = []
    for (const row of subjectRows) {
      if (!_.isNil(row.userId)) {
        userIds.add(row.userId)
      } else if (!_.isNil(row.groupId)) {
        groupIds.push(row.groupId)
      }
    }
    if (groupIds.length > 0) {
      // Live membership lookup — deliberately not cached / snapshotted.
      const memberships = await WIKI.models.knex('userGroups')
        .whereIn('groupId', _.uniq(groupIds))
        .select('userId')
      for (const m of memberships) {
        userIds.add(m.userId)
      }
    }
    return userIds
  },

  /**
   * Resolve subject rows to de-duplicated user records (id, name, email).
   * @param {Array} subjectRows rows with { userId, groupId }
   * @returns {Promise<Array>} user records
   */
  async resolveSubjectsToUsers (subjectRows) {
    const userIds = await this.resolveSubjectUserIds(subjectRows)
    if (userIds.size < 1) { return [] }
    return WIKI.models.users.query()
      .select('id', 'name', 'email')
      .whereIn('id', [...userIds])
  }
}
