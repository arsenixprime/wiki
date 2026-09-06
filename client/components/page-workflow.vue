<template lang="pug">
  div
    //- ===================== WATCH + STATUS CARD =====================
    v-card.mb-3.page-workflow-card(flat)
      v-toolbar(:color='$vuetify.theme.dark ? `grey darken-4-d3` : `grey lighten-3`', flat, dense)
        .caption.text-uppercase.grey--text {{ $t('common:workflow.title') }}
        v-spacer
        v-tooltip(bottom)
          template(v-slot:activator='{ on }')
            v-btn(icon, tile, v-on='on', @click='toggleWatch', :loading='watchLoading', :aria-label='$t(`common:workflow.watch`)')
              v-icon(:color='wf.isWatching ? `primary` : `grey`') {{ wf.isWatching ? 'mdi-eye' : 'mdi-eye-outline' }}
          span {{ wf.isWatching ? $t('common:workflow.watching') : $t('common:workflow.watch') }}
      v-card-text.py-3
        //- Approved / Reviewed status
        template(v-if='approval && approval.mode !== `off`')
          .d-flex.align-center.mb-2
            v-chip(v-if='approval.mode === `approve` && approval.isComplete', color='green', dark, small, label)
              v-icon(left, small) mdi-check-decagram
              | {{ $t('common:workflow.approved') }}
            v-chip(v-else, :color='approval.mode === `approve` ? `orange` : `blue`', dark, small, label)
              v-icon(left, small) mdi-progress-check
              | {{ wording.past }} {{ approval.approvedCount }} / {{ approval.total }}
          v-list.py-0(dense, v-if='approval.approvers.length > 0')
            v-list-item.px-0(v-for='ap in approval.approvers', :key='ap.userId', style='min-height:28px;')
              v-list-item-icon.my-1.mr-2
                v-icon(small, :color='ap.approved ? `green` : `grey`') {{ ap.approved ? 'mdi-check-circle' : 'mdi-clock-outline' }}
              v-list-item-content.py-0
                .caption {{ ap.name }}
                  span.grey--text(v-if='ap.approved && ap.approvedAt') &nbsp;· {{ ap.approvedAt | date }}
                  span.orange--text(v-else-if='ap.approvedVersionId') &nbsp;· {{ $t('common:workflow.lastApproved', { v: ap.approvedVersionId }) }}
          .mt-2
            v-btn.mr-2.mb-1(v-if='isApprover', x-small, color='green', dark, @click='doApprove', :loading='actionLoading')
              v-icon(left, x-small) mdi-check
              | {{ wording.verb }}
            v-btn.mr-2.mb-1(v-if='isApprover', x-small, outlined, color='orange', @click='changesDialog = true')
              v-icon(left, x-small) mdi-message-alert
              | {{ $t('common:workflow.requestChanges') }}
            v-btn.mb-1(v-if='canRequest', x-small, outlined, @click='doRequestApproval', :loading='actionLoading')
              v-icon(left, x-small) mdi-send
              | {{ $t('common:workflow.requestReview', { noun: wording.noun }) }}
        //- Watchers list (openly visible)
        .mt-3
          .caption.grey--text.text--darken-1.mb-1 {{ $t('common:workflow.watchers') }} ({{ watchers.length }})
          .caption.grey--text.font-italic(v-if='watchers.length < 1') {{ $t('common:workflow.noWatchers') }}
          div(v-else)
            v-chip.mr-1.mb-1(v-for='w in watchers', :key='w.kind + w.id', x-small, label, :color='w.kind === `group` ? `deep-purple lighten-4` : `blue lighten-4`')
              v-icon(x-small, left) {{ w.kind === 'group' ? 'mdi-account-group' : 'mdi-account' }}
              | {{ w.name }}

    //- ===================== MANAGED / DRAFTS CARD =====================
    v-card.mb-3.page-workflow-card(flat, v-if='wf.isManaged')
      v-toolbar(:color='$vuetify.theme.dark ? `grey darken-4-d3` : `grey lighten-3`', flat, dense)
        v-menu(open-on-hover, offset-y, bottom, min-width='220', :close-on-content-click='false')
          template(v-slot:activator='{ on }')
            .d-flex.align-center(v-on='on', style='cursor:help;')
              v-icon.mr-2(small, color='grey') mdi-shield-lock-outline
              .caption.text-uppercase.grey--text {{ $t('common:workflow.managedPage') }}
              v-icon.ml-1(x-small, color='grey') mdi-information-outline
          v-card
            v-card-text.py-2
              .caption.grey--text.text--darken-1.mb-1 {{ $t('common:workflow.managedBy') }}
              .caption.grey--text.font-italic(v-if='managers.length < 1') {{ $t('common:workflow.noManagers') }}
              div(v-else)
                v-chip.mr-1.mb-1(v-for='m in managers', :key='m.kind + m.id', x-small, label, :color='m.kind === `group` ? `deep-purple lighten-4` : `blue lighten-4`')
                  v-icon(x-small, left) {{ m.kind === 'group' ? 'mdi-account-group' : 'mdi-account' }}
                  | {{ m.name }}
        v-spacer
        v-btn(small, color='primary', text, @click='openCreateDraft', :loading='actionLoading')
          v-icon(left, small) mdi-file-document-plus-outline
          | {{ $t('common:workflow.newDraft') }}
      v-card-text.py-2
        .caption.grey--text.font-italic(v-if='drafts.length < 1') {{ $t('common:workflow.noDrafts') }}
        v-list.py-0(dense, v-else)
          v-list-item.px-0(v-for='d in drafts', :key='d.id')
            v-list-item-content
              v-list-item-title.body-2 {{ d.title || $t('common:workflow.untitledDraft') }}
              v-list-item-subtitle.caption
                v-chip.mr-1(x-small, :color='d.status === `submitted` ? `orange` : `grey lighten-1`', :text-color='d.status === `submitted` ? `white` : ``') {{ d.status }}
                span {{ $t('common:workflow.lastEditedBy', { name: d.updatedByName || '?' }) }}
            v-list-item-action.flex-row.align-center
              v-btn(icon, small, @click='openReview(d)', :title='$t(`common:workflow.review`)'): v-icon(small) mdi-file-compare
              v-btn(icon, small, @click='openEditDraft(d)', :title='$t(`common:actions.edit`)'): v-icon(small) mdi-pencil
              v-btn(icon, small, @click='deleteDraft(d)', :title='$t(`common:actions.delete`)'): v-icon(small, color='red') mdi-delete-outline

    //- ===================== REVIEW / DIFF DIALOG =====================
    v-dialog(v-model='reviewDialog', width='1100', scrollable)
      v-card(v-if='reviewDraft')
        .dialog-header
          v-icon(color='white') mdi-file-compare
          .subtitle-1.white--text.ml-3 {{ $t('common:workflow.reviewDraft') }}: {{ reviewDraft.title }}
          v-spacer
          v-chip(small, :color='reviewDraft.status === `submitted` ? `orange` : `grey`', dark) {{ reviewDraft.status }}
        v-card-text.pt-4(style='max-height:60vh;')
          .caption.grey--text.mb-2 {{ $t('common:workflow.diffHint') }}
          .diff-container(v-html='reviewDiffHtml')
        v-card-actions.px-4.pb-4
          v-btn(text, @click='reviewDialog = false') {{ $t('common:actions.close') }}
          v-spacer
          v-btn.mr-2(v-if='reviewDraft.status !== `submitted`', color='blue', text, @click='submitDraft(reviewDraft)', :loading='actionLoading')
            v-icon(left) mdi-send
            | {{ $t('common:workflow.submitForReview') }}
          template(v-if='wf.canManage')
            v-btn.mr-2(color='orange', text, @click='rejectDraft(reviewDraft)', :loading='actionLoading') {{ $t('common:workflow.reject') }}
            v-btn(color='green', dark, @click='publishDraft(reviewDraft)', :loading='actionLoading')
              v-icon(left) mdi-publish
              | {{ $t('common:workflow.publish') }}

    //- ===================== REQUEST CHANGES DIALOG =====================
    v-dialog(v-model='changesDialog', width='560')
      v-card
        .dialog-header
          v-icon(color='white') mdi-message-alert-outline
          .subtitle-1.white--text.ml-3 {{ $t('common:workflow.requestChanges') }}
          v-spacer
        v-card-text.pt-4
          v-textarea(outlined, :label='$t(`common:workflow.comment`)', v-model='changesComment', rows='4', auto-grow)
        v-card-actions.px-4.pb-4
          v-spacer
          v-btn(text, @click='changesDialog = false') {{ $t('common:actions.cancel') }}
          v-btn(color='orange', dark, @click='doRequestChanges', :loading='actionLoading') {{ $t('common:workflow.send') }}
</template>

<script>
import _ from 'lodash'
import gql from 'graphql-tag'
import { get } from 'vuex-pathify'
import * as Diff2Html from 'diff2html'
import { createPatch } from 'diff'

export default {
  filters: {
    date (val) {
      if (!val) { return '' }
      return new Date(val).toLocaleString()
    }
  },
  props: {
    pageId: { type: Number, required: true }
  },
  data () {
    return {
      wf: { isManaged: false, approvalMode: 'off', isWatching: false, canManage: false, effectiveDelayMins: 30 },
      watchers: [],
      managers: [],
      approval: null,
      drafts: [],
      approvers: [],
      pageContent: '',
      watchLoading: false,
      actionLoading: false,
      reviewDialog: false,
      reviewDraft: null,
      changesDialog: false,
      changesComment: '',
      wfData: null
    }
  },
  computed: {
    currentUserId: get('user/id'),
    wording () {
      return (this.wf.approvalMode === 'approve') ?
        { verb: this.$t('common:workflow.approve'), past: this.$t('common:workflow.approvedBy'), noun: this.$t('common:workflow.approval') } :
        { verb: this.$t('common:workflow.review'), past: this.$t('common:workflow.reviewedBy'), noun: this.$t('common:workflow.reviewNoun') }
    },
    isApprover () {
      return this.approval && this.approval.approvers.some(a => a.userId === this.currentUserId)
    },
    canRequest () {
      return this.wf.canManage
    },
    reviewDiffHtml () {
      if (!this.reviewDraft) { return '' }
      const patch = createPatch(this.path || 'page', this.pageContent || '', this.reviewDraft.content || '', this.$t('common:workflow.livePage'), this.$t('common:workflow.draft'))
      return Diff2Html.html(patch, { drawFileList: false, matching: 'lines', outputFormat: 'side-by-side' })
    },
    path: get('page/path'),
    locale: get('page/locale')
  },
  methods: {
    async refetch () {
      await this.$apollo.queries.wfData.refetch()
    },
    async toggleWatch () {
      this.watchLoading = true
      const mutation = this.wf.isWatching ?
        gql`mutation($id: Int!) { pages { unwatch(pageId: $id) { responseResult { succeeded message } } } }` :
        gql`mutation($id: Int!) { pages { watch(pageId: $id) { responseResult { succeeded message } } } }`
      try {
        await this.$apollo.mutate({ mutation, variables: { id: this.pageId } })
        this.wf.isWatching = !this.wf.isWatching
        await this.refetch()
      } catch (err) { this.notifyErr(err) }
      this.watchLoading = false
    },
    async doApprove () {
      await this.runMutation(gql`mutation($id: Int!) { pages { approve(pageId: $id) { responseResult { succeeded message } } } }`, { id: this.pageId }, 'pages.approve')
    },
    async doRequestApproval () {
      await this.runMutation(gql`mutation($id: Int!) { pages { requestApproval(pageId: $id) { responseResult { succeeded message } } } }`, { id: this.pageId }, 'pages.requestApproval')
    },
    async doRequestChanges () {
      await this.runMutation(gql`mutation($id: Int!, $c: String) { pages { requestChanges(pageId: $id, comment: $c) { responseResult { succeeded message } } } }`, { id: this.pageId, c: this.changesComment }, 'pages.requestChanges')
      this.changesDialog = false
      this.changesComment = ''
    },
    async openCreateDraft () {
      // Create with null content so the server copies the current live page
      // content/metadata (avoids needing raw-source access on the client), then
      // open the freshly-created draft in the FULL editor (draft mode).
      this.actionLoading = true
      try {
        const resp = await this.$apollo.mutate({
          mutation: gql`mutation($id: Int!) { pages { createDraft(pageId: $id) { responseResult { succeeded message } draft { id } } } }`,
          variables: { id: this.pageId }
        })
        const rr = _.get(resp, 'data.pages.createDraft.responseResult', {})
        if (!rr.succeeded) { throw new Error(rr.message) }
        const draft = _.get(resp, 'data.pages.createDraft.draft')
        this.openEditDraft(draft)
      } catch (err) { this.notifyErr(err) }
      this.actionLoading = false
    },
    openEditDraft (d) {
      // Open the real editor bound to this draft (full markdown/visual editor,
      // preview, image paste, properties). Save writes to the draft.
      window.location.assign(`/e/${this.locale}/${this.path}?draft=${d.id}`)
    },
    async openReview (d) {
      this.reviewDraft = d
      // Fetch the live page source for the diff. Requires read:source /
      // manage:pages; if the viewer lacks it the diff falls back to showing the
      // draft content as fully-added (still reviewable by managers).
      try {
        const resp = await this.$apollo.query({
          query: gql`query($id: Int!) { pages { single(id: $id) { content } } }`,
          variables: { id: this.pageId },
          fetchPolicy: 'network-only'
        })
        this.pageContent = _.get(resp, 'data.pages.single.content', '')
      } catch (err) {
        this.pageContent = ''
      }
      this.reviewDialog = true
    },
    async deleteDraft (d) {
      await this.runMutation(gql`mutation($id: Int!) { pages { deleteDraft(id: $id) { responseResult { succeeded message } } } }`, { id: d.id }, 'pages.deleteDraft')
    },
    async submitDraft (d) {
      await this.runMutation(gql`mutation($id: Int!) { pages { submitDraft(id: $id) { responseResult { succeeded message } } } }`, { id: d.id }, 'pages.submitDraft')
      this.reviewDialog = false
    },
    async publishDraft (d) {
      await this.runMutation(gql`mutation($id: Int!) { pages { publishDraft(id: $id) { responseResult { succeeded message } } } }`, { id: d.id }, 'pages.publishDraft')
      this.reviewDialog = false
      this.$store.commit('showNotification', { style: 'success', icon: 'check', message: this.$t('common:workflow.draftPublished') })
      _.delay(() => window.location.reload(), 1200)
    },
    async rejectDraft (d) {
      const comment = window.prompt(this.$t('common:workflow.rejectPrompt')) || ''
      await this.runMutation(gql`mutation($id: Int!, $c: String) { pages { rejectDraft(id: $id, comment: $c) { responseResult { succeeded message } } } }`, { id: d.id, c: comment }, 'pages.rejectDraft')
      this.reviewDialog = false
    },
    async runMutation (mutation, variables, respPath) {
      this.actionLoading = true
      try {
        const resp = await this.$apollo.mutate({ mutation, variables })
        const rr = _.get(resp, `data.${respPath}.responseResult`, { succeeded: true })
        if (!rr.succeeded) { throw new Error(rr.message) }
        this.$store.commit('showNotification', { style: 'success', icon: 'check', message: rr.message || this.$t('common:workflow.done') })
        await this.refetch()
      } catch (err) { this.notifyErr(err) }
      this.actionLoading = false
    },
    notifyErr (err) {
      this.$store.commit('showNotification', { style: 'red', icon: 'alert', message: err.message })
    },
    maybeOpenDraftFromQuery () {
      const params = new URLSearchParams(window.location.search)
      const draftId = parseInt(params.get('wfdraft'), 10)
      if (draftId) {
        const d = this.drafts.find(x => x.id === draftId)
        if (d) { this.openReview(d) }
      }
    }
  },
  apollo: {
    wfData: {
      query: gql`
        query ($id: Int!) {
          pages {
            workflowState(pageId: $id) { isManaged approvalMode watchNotifyDelayMins effectiveDelayMins isWatching canManage }
            watchers(pageId: $id) { id kind userId groupId name }
            managers(pageId: $id) { id kind userId groupId name }
            approvalStatus(pageId: $id) { mode currentRevisionId total approvedCount isComplete approvers { userId name approved approvedVersionId approvedAt } }
            drafts(pageId: $id) { id pageId content title description status updatedBy updatedByName createdByName submittedAt updatedAt }
          }
        }
      `,
      variables () { return { id: this.pageId } },
      fetchPolicy: 'cache-and-network',
      update (data) {
        const p = data.pages
        this.wf = p.workflowState || this.wf
        this.watchers = p.watchers || []
        this.managers = p.managers || []
        this.approval = p.approvalStatus || null
        this.drafts = p.drafts || []
        this.$emit('approval', this.approval)
        this.$nextTick(() => this.maybeOpenDraftFromQuery())
        return true
      },
      error (err) {
        // Non-fatal: a reader without workflow access simply sees no panel.
        this.$emit('approval', null)
      }
    }
  }
}
</script>

<style lang="scss">
.page-workflow-card {
  .diff-container {
    font-size: 12px;
  }
}
</style>
