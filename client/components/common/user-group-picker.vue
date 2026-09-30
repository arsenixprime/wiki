<template lang="pug">
  div
    .caption.grey--text.text--darken-1(v-if='label') {{ label }}
    .mt-1(v-if='rows.length > 0')
      v-chip.mr-1.mb-1(
        v-for='row in rows'
        :key='row.key'
        :color='chipColor(row)'
        :text-color='row.state === `removed` ? `grey darken-1` : undefined'
        :outlined='row.state === `removed`'
        :class='{ "ugp-removed": row.state === `removed` }'
        label
        )
        v-icon.mr-1(small) {{ chipIcon(row) }}
        span.ugp-name {{ row.subject.name }}
        span.ugp-tag.ml-2(v-if='row.state === `added`') {{ $t('common:workflow.pendingNew') }}
        span.ugp-tag.ml-2(v-else-if='row.state === `removed`') {{ $t('common:workflow.pendingRemoved') }}
        template(v-if='!readonly')
          v-btn.ml-1(v-if='row.state === `removed`', icon, x-small, :title='$t(`common:workflow.undoRemove`)', @click.stop='restoreSubject(row.subject)')
            v-icon(small) mdi-undo
          v-btn.ml-1(v-else, icon, x-small, @click.stop='removeSubject(row.subject)')
            v-icon(small) mdi-close-circle
    .caption.grey--text.font-italic(v-else) {{ $t('common:workflow.noneAssigned') }}
    .caption.orange--text.text--darken-2.mt-1(v-if='hasBaseline && isDirty') {{ $t('common:workflow.pendingSummary', { added: addedCount, removed: removedCount }) }}
    .mt-2(v-if='!readonly')
      v-btn.mr-2(small, outlined, color='primary', @click='userSearchShown = true')
        v-icon(left, small) mdi-account-plus
        span {{ $t('common:workflow.addUser') }}
      v-menu(offset-y, :close-on-content-click='false', v-model='groupMenuShown')
        template(v-slot:activator='{ on }')
          v-btn(small, outlined, color='deep-purple', v-on='on')
            v-icon(left, small) mdi-account-group
            span {{ $t('common:workflow.addGroup') }}
        v-list(dense, max-height='300', style='overflow-y:auto;')
          v-list-item(
            v-for='grp in availableGroups'
            :key='grp.id'
            @click='addGroup(grp)'
            )
            v-list-item-icon.mr-2: v-icon(small) mdi-account-group
            v-list-item-title {{ grp.name }}
          v-list-item(v-if='availableGroups.length < 1', disabled)
            v-list-item-title.caption.grey--text {{ $t('common:workflow.allGroupsAdded') }}
    user-search(v-model='userSearchShown', @select='addUser')
</template>

<script>
import _ from 'lodash'
import gql from 'graphql-tag'
import UserSearch from './user-search.vue'

/**
 * Stable identity for a subject row: `user-<id>` or `group-<id>`.
 */
export function subjectKey (s) {
  return `${s.kind}-${s.kind === 'group' ? s.groupId : s.userId}`
}

/**
 * Diff a pending subject list against its saved baseline.
 * Returns { added, removed } arrays of subjects, compared by (kind, id).
 */
export function diffSubjects (pending, baseline) {
  const pendingKeys = new Set((pending || []).map(subjectKey))
  const baseKeys = new Set((baseline || []).map(subjectKey))
  return {
    added: (pending || []).filter(s => !baseKeys.has(subjectKey(s))),
    removed: (baseline || []).filter(s => !pendingKeys.has(subjectKey(s)))
  }
}

export default {
  components: { UserSearch },
  props: {
    value: { type: Array, default: () => ([]) },
    /**
     * The last-saved list. When provided, chips are rendered with a pending
     * state: entries in `value` but not in `baseline` are marked as new,
     * entries in `baseline` but not in `value` stay visible, struck through,
     * with an undo control. Omit to get plain (stateless) rendering.
     */
    baseline: { type: Array, default: null },
    label: { type: String, default: '' },
    readonly: { type: Boolean, default: false }
  },
  data () {
    return {
      userSearchShown: false,
      groupMenuShown: false,
      groups: []
    }
  },
  computed: {
    subjects: {
      get () { return this.value },
      set (val) { this.$emit('input', val) }
    },
    hasBaseline () {
      return _.isArray(this.baseline)
    },
    diff () {
      return diffSubjects(this.subjects, this.hasBaseline ? this.baseline : this.subjects)
    },
    addedCount () { return this.diff.added.length },
    removedCount () { return this.diff.removed.length },
    isDirty () { return this.addedCount > 0 || this.removedCount > 0 },
    /**
     * Rows to render: baseline order first (unchanged + removed, in their
     * saved order), then pending additions at the end.
     */
    rows () {
      if (!this.hasBaseline) {
        return this.subjects.map(s => ({ key: subjectKey(s), subject: s, state: 'unchanged' }))
      }
      const pendingKeys = new Set(this.subjects.map(subjectKey))
      const baseKeys = new Set(this.baseline.map(subjectKey))
      const fromBase = this.baseline.map(s => ({
        key: subjectKey(s),
        subject: s,
        state: pendingKeys.has(subjectKey(s)) ? 'unchanged' : 'removed'
      }))
      const added = this.subjects
        .filter(s => !baseKeys.has(subjectKey(s)))
        .map(s => ({ key: subjectKey(s), subject: s, state: 'added' }))
      return [...fromBase, ...added]
    },
    availableGroups () {
      const takenGroupIds = this.subjects.filter(s => s.kind === 'group').map(s => s.groupId)
      return this.groups.filter(g => !_.includes(takenGroupIds, g.id))
    }
  },
  methods: {
    chipColor (row) {
      switch (row.state) {
        case 'added': return 'green lighten-4'
        case 'removed': return 'grey'
        default: return row.subject.kind === 'group' ? 'deep-purple lighten-4' : 'blue lighten-4'
      }
    },
    chipIcon (row) {
      if (row.state === 'added') { return 'mdi-plus-circle' }
      return row.subject.kind === 'group' ? 'mdi-account-group' : 'mdi-account'
    },
    addUser (usr) {
      if (this.subjects.some(s => s.kind === 'user' && s.userId === usr.id)) { return }
      this.subjects = [...this.subjects, { kind: 'user', userId: usr.id, groupId: null, name: usr.name }]
    },
    addGroup (grp) {
      if (this.subjects.some(s => s.kind === 'group' && s.groupId === grp.id)) { return }
      this.subjects = [...this.subjects, { kind: 'group', userId: null, groupId: grp.id, name: grp.name }]
      this.groupMenuShown = false
    },
    removeSubject (subject) {
      const key = subjectKey(subject)
      this.subjects = this.subjects.filter(s => subjectKey(s) !== key)
    },
    restoreSubject (subject) {
      if (this.subjects.some(s => subjectKey(s) === subjectKey(subject))) { return }
      this.subjects = [...this.subjects, _.cloneDeep(subject)]
    }
  },
  apollo: {
    groups: {
      query: gql`
        query { pages { assignableGroups { id name } } }
      `,
      fetchPolicy: 'cache-and-network',
      update: (data) => _.get(data, 'pages.assignableGroups', [])
    }
  }
}
</script>

<style lang="scss">
.ugp-removed {
  opacity: .75;
  .ugp-name {
    text-decoration: line-through;
  }
}
.ugp-tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .5px;
  opacity: .8;
}
</style>
