<template lang="pug">
  div
    .caption.grey--text.text--darken-1(v-if='label') {{ label }}
    .mt-1(v-if='subjects.length > 0')
      v-chip.mr-1.mb-1(
        v-for='(s, idx) in subjects'
        :key='s.kind + `-` + (s.userId || s.groupId)'
        :color='s.kind === `group` ? `deep-purple lighten-4` : `blue lighten-4`'
        label
        :close='!readonly'
        @click:close='removeSubject(idx)'
        )
        v-icon.mr-1(small) {{ s.kind === 'group' ? 'mdi-account-group' : 'mdi-account' }}
        span {{ s.name }}
    .caption.grey--text.font-italic(v-else) {{ $t('common:workflow.noneAssigned') }}
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

export default {
  components: { UserSearch },
  props: {
    value: { type: Array, default: () => ([]) },
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
    availableGroups () {
      const takenGroupIds = this.subjects.filter(s => s.kind === 'group').map(s => s.groupId)
      return this.groups.filter(g => !_.includes(takenGroupIds, g.id))
    }
  },
  methods: {
    addUser (usr) {
      if (this.subjects.some(s => s.kind === 'user' && s.userId === usr.id)) { return }
      this.subjects = [...this.subjects, { kind: 'user', userId: usr.id, groupId: null, name: usr.name }]
    },
    addGroup (grp) {
      if (this.subjects.some(s => s.kind === 'group' && s.groupId === grp.id)) { return }
      this.subjects = [...this.subjects, { kind: 'group', userId: null, groupId: grp.id, name: grp.name }]
      this.groupMenuShown = false
    },
    removeSubject (idx) {
      const next = this.subjects.slice()
      next.splice(idx, 1)
      this.subjects = next
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
