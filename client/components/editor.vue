<template lang="pug">
  v-app.editor(:dark='$vuetify.theme.dark')
    nav-header(dense)
      template(slot='mid')
        v-text-field.editor-title-input(
          dark
          solo
          flat
          v-model='currentPageTitle'
          hide-details
          background-color='black'
          dense
          full-width
        )
      template(slot='actions')
        v-btn.mr-3.animated.fadeIn(color='amber', outlined, small, v-if='isConflict', @click='openConflict')
          .overline.amber--text.mr-3 Conflict
          status-indicator(intermediary, pulse)
        v-btn.animated.fadeInDown(
          text
          color='green'
          @click.exact='save'
          @click.ctrl.exact='saveAndClose'
          :class='{ "is-icon": $vuetify.breakpoint.mdAndDown }'
          )
          v-icon(color='green', :left='$vuetify.breakpoint.lgAndUp') mdi-check
          span.grey--text(v-if='$vuetify.breakpoint.lgAndUp && mode !== `create` && !isDirty') {{ $t('editor:save.saved') }}
          span.white--text(v-else-if='$vuetify.breakpoint.lgAndUp') {{ mode === 'create' ? $t('common:actions.create') : $t('common:actions.save') }}
        v-btn.animated.fadeInDown.wait-p1s(
          text
          color='blue'
          @click='openPropsModal'
          :class='{ "is-icon": $vuetify.breakpoint.mdAndDown, "mx-0": !welcomeMode, "ml-0": welcomeMode }'
          )
          v-icon(color='blue', :left='$vuetify.breakpoint.lgAndUp') mdi-tag-text-outline
          span.white--text(v-if='$vuetify.breakpoint.lgAndUp') {{ $t('common:actions.page') }}
        v-btn.animated.fadeInDown.wait-p2s(
          v-if='!welcomeMode'
          text
          color='red'
          :class='{ "is-icon": $vuetify.breakpoint.mdAndDown }'
          @click='exit'
          )
          v-icon(color='red', :left='$vuetify.breakpoint.lgAndUp') mdi-close
          span.white--text(v-if='$vuetify.breakpoint.lgAndUp') {{ $t('common:actions.close') }}
        v-divider.ml-3(vertical)
    v-main
      v-alert.mb-0(v-if='draftMode || (wfManaged && !wfCanManage)', :color='draftMode ? `indigo` : `deep-orange`', dark, dense, tile, prominent, :icon='draftMode ? `mdi-file-document-edit-outline` : `mdi-shield-lock-outline`')
        .d-flex.align-center
          .body-2 {{ draftMode ? $t('editor:managed.draftBanner') : $t('editor:managed.banner') }}
          v-spacer
          v-btn.ml-3(v-if='wfDraftId', small, color='white', outlined, @click='submitWfDraft') {{ $t('common:workflow.submitForReview') }}
      component(:is='currentEditor', :save='save')
      editor-modal-properties(v-model='dialogProps')
      editor-modal-editorselect(v-model='dialogEditorSelector')
      editor-modal-unsaved(v-model='dialogUnsaved', @discard='exitGo')
      component(:is='activeModal')

    loader(v-model='dialogProgress', :title='$t(`editor:save.processing`)', :subtitle='$t(`editor:save.pleaseWait`)')
    notify
</template>

<script>
import _ from 'lodash'
import gql from 'graphql-tag'
import { get, sync } from 'vuex-pathify'
import { AtomSpinner } from 'epic-spinners'
import { Base64 } from 'js-base64'
import { StatusIndicator } from 'vue-status-indicator'

import editorStore from '../store/editor'

/* global WIKI */

WIKI.$store.registerModule('editor', editorStore)

export default {
  i18nOptions: { namespaces: 'editor' },
  components: {
    AtomSpinner,
    StatusIndicator,
    editorApi: () => import(/* webpackChunkName: "editor-api", webpackMode: "lazy" */ './editor/editor-api.vue'),
    editorCode: () => import(/* webpackChunkName: "editor-code", webpackMode: "lazy" */ './editor/editor-code.vue'),
    editorCkeditor: () => import(/* webpackChunkName: "editor-ckeditor", webpackMode: "lazy" */ './editor/editor-ckeditor.vue'),
    editorAsciidoc: () => import(/* webpackChunkName: "editor-asciidoc", webpackMode: "lazy" */ './editor/editor-asciidoc.vue'),
    editorMarkdown: () => import(/* webpackChunkName: "editor-markdown", webpackMode: "lazy" */ './editor/editor-markdown.vue'),
    editorRedirect: () => import(/* webpackChunkName: "editor-redirect", webpackMode: "lazy" */ './editor/editor-redirect.vue'),
    editorModalEditorselect: () => import(/* webpackChunkName: "editor", webpackMode: "eager" */ './editor/editor-modal-editorselect.vue'),
    editorModalProperties: () => import(/* webpackChunkName: "editor", webpackMode: "eager" */ './editor/editor-modal-properties.vue'),
    editorModalUnsaved: () => import(/* webpackChunkName: "editor", webpackMode: "eager" */ './editor/editor-modal-unsaved.vue'),
    editorModalMedia: () => import(/* webpackChunkName: "editor", webpackMode: "eager" */ './editor/editor-modal-media.vue'),
    editorModalBlocks: () => import(/* webpackChunkName: "editor", webpackMode: "eager" */ './editor/editor-modal-blocks.vue'),
    editorModalConflict: () => import(/* webpackChunkName: "editor-conflict", webpackMode: "lazy" */ './editor/editor-modal-conflict.vue'),
    editorModalDrawio: () => import(/* webpackChunkName: "editor", webpackMode: "eager" */ './editor/editor-modal-drawio.vue')
  },
  props: {
    locale: {
      type: String,
      default: 'en'
    },
    path: {
      type: String,
      default: 'home'
    },
    title: {
      type: String,
      default: 'Untitled Page'
    },
    description: {
      type: String,
      default: ''
    },
    tags: {
      type: Array,
      default: () => ([])
    },
    isPublished: {
      type: Boolean,
      default: true
    },
    scriptCss: {
      type: String,
      default: ''
    },
    publishStartDate: {
      type: String,
      default: ''
    },
    publishEndDate: {
      type: String,
      default: ''
    },
    scriptJs: {
      type: String,
      default: ''
    },
    initEditor: {
      type: String,
      default: null
    },
    initMode: {
      type: String,
      default: 'create'
    },
    initContent: {
      type: String,
      default: null
    },
    pageId: {
      type: Number,
      default: 0
    },
    checkoutDate: {
      type: String,
      default: new Date().toISOString()
    },
    effectivePermissions: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      isSaving: false,
      isConflict: false,
      dialogProps: false,
      dialogProgress: false,
      dialogEditorSelector: false,
      dialogUnsaved: false,
      exitConfirmed: false,
      initContentParsed: '',
      wfManaged: false,
      wfCanManage: false,
      wfDraftId: null,
      draftMode: false,
      savedState: {
        description: '',
        isPublished: false,
        publishEndDate: '',
        publishStartDate: '',
        tags: '',
        title: '',
        css: '',
        js: ''
      }
    }
  },
  computed: {
    currentEditor: sync('editor/editor'),
    activeModal: sync('editor/activeModal'),
    mode: get('editor/mode'),
    welcomeMode() { return this.mode === `create` && this.path === `home` },
    currentPageTitle: sync('page/title'),
    checkoutDateActive: sync('editor/checkoutDateActive'),
    currentStyling: get('page/scriptCss'),
    isDirty () {
      return _.some([
        this.initContentParsed !== this.$store.get('editor/content'),
        this.locale !== this.$store.get('page/locale'),
        this.path !== this.$store.get('page/path'),
        this.savedState.title !== this.$store.get('page/title'),
        this.savedState.description !== this.$store.get('page/description'),
        this.savedState.tags !== this.$store.get('page/tags'),
        this.savedState.isPublished !== this.$store.get('page/isPublished'),
        this.savedState.publishStartDate !== this.$store.get('page/publishStartDate'),
        this.savedState.publishEndDate !== this.$store.get('page/publishEndDate'),
        this.savedState.css !== this.$store.get('page/scriptCss'),
        this.savedState.js !== this.$store.get('page/scriptJs')
      ], Boolean)
    }
  },
  watch: {
    currentEditor(newValue, oldValue) {
      if (newValue !== '' && this.mode === 'create') {
        _.delay(() => {
          this.dialogProps = true
        }, 500)
      }
    },
    currentStyling(newValue) {
      this.injectCustomCss(newValue)
    }
  },
  created() {
    this.$store.set('page/id', this.pageId)
    this.$store.set('page/description', this.description)
    this.$store.set('page/isPublished', this.isPublished)
    this.$store.set('page/publishStartDate', this.publishStartDate)
    this.$store.set('page/publishEndDate', this.publishEndDate)
    this.$store.set('page/locale', this.locale)
    this.$store.set('page/path', this.path)
    this.$store.set('page/tags', this.tags)
    this.$store.set('page/title', this.title)
    this.$store.set('page/scriptCss', this.scriptCss)
    this.$store.set('page/scriptJs', this.scriptJs)

    this.$store.set('page/mode', 'edit')

    this.setCurrentSavedState()

    this.checkoutDateActive = this.checkoutDate

    if (this.effectivePermissions) {
      this.$store.set('page/effectivePermissions', JSON.parse(Buffer.from(this.effectivePermissions, 'base64').toString()))
    }
  },
  mounted() {
    this.$store.set('editor/mode', this.initMode || 'create')

    this.initContentParsed = this.initContent ? Base64.decode(this.initContent) : ''
    this.$store.set('editor/content', this.initContentParsed)

    // -> Draft mode: /e/<locale>/<path>?draft=<id> edits a managed-page draft in
    //    the full editor. Load the draft content BEFORE the child editor mounts
    //    (it reads editor/content on mount) so it renders the draft, not the live
    //    page. Save is routed to the draft (see save()).
    const draftId = parseInt(new URLSearchParams(window.location.search).get('draft'), 10)
    if (Number.isFinite(draftId) && this.pageId > 0) {
      this.draftMode = true
      this.wfDraftId = draftId
      this.loadDraftIntoEditor(draftId)
    } else if (this.mode === 'create' && !this.initEditor) {
      _.delay(() => {
        this.dialogEditorSelector = true
      }, 500)
    } else {
      this.currentEditor = `editor${_.startCase(this.initEditor || 'markdown')}`
    }

    window.onbeforeunload = () => {
      if (!this.exitConfirmed && this.initContentParsed !== this.$store.get('editor/content')) {
        return this.$t('editor:unsavedWarning')
      } else {
        return undefined
      }
    }

    this.$root.$on('resetEditorConflict', () => {
      this.isConflict = false
    })

    // -> Managed page: detect whether this user must edit via a draft
    if (this.mode !== 'create' && this.pageId > 0) {
      this.loadWorkflowState()
    }

    // this.$store.set('editor/mode', 'edit')
    // this.currentEditor = `editorApi`
  },
  methods: {
    openPropsModal(name) {
      this.dialogProps = true
    },
    showProgressDialog(textKey) {
      this.dialogProgress = true
    },
    hideProgressDialog() {
      this.dialogProgress = false
    },
    openConflict() {
      this.$root.$emit('saveConflict')
    },
    async loadWorkflowState () {
      try {
        const resp = await this.$apollo.query({
          query: gql`query ($id: Int!) { pages { workflowState(pageId: $id) { isManaged canManage } } }`,
          variables: { id: this.pageId },
          fetchPolicy: 'network-only'
        })
        this.wfManaged = _.get(resp, 'data.pages.workflowState.isManaged', false)
        this.wfCanManage = _.get(resp, 'data.pages.workflowState.canManage', false)
      } catch (err) { /* non-fatal */ }
    },
    // Load a draft's content/metadata into the editor store, then mount the
    // matching editor component (markdown/visual) so it renders the draft.
    async loadDraftIntoEditor (id) {
      try {
        const resp = await this.$apollo.query({
          query: gql`query ($id: Int!) { pages { draft(id: $id) { id content title description editorKey } } }`,
          variables: { id },
          fetchPolicy: 'network-only'
        })
        const d = _.get(resp, 'data.pages.draft')
        if (!d) { throw new Error(this.$t('editor:managed.draftMissing')) }
        this.$store.set('editor/content', d.content || '')
        if (d.title) { this.$store.set('page/title', d.title) }
        if (d.description) { this.$store.set('page/description', d.description) }
        const ed = d.editorKey || this.initEditor || 'markdown'
        this.$store.set('editor/editorKey', ed)
        this.initContentParsed = d.content || ''
        this.setCurrentSavedState()
        this.currentEditor = `editor${_.startCase(ed)}`
      } catch (err) {
        this.$store.commit('showNotification', { style: 'red', icon: 'alert', message: err.message })
        this.currentEditor = `editor${_.startCase(this.initEditor || 'markdown')}`
      }
    },
    // A non-manager editing a managed page cannot publish directly; their save
    // is transparently routed into a draft they can later submit for review.
    async saveAsDraft () {
      this.isSaving = true
      try {
        const content = this.$store.get('editor/content')
        const title = this.$store.get('page/title')
        const description = this.$store.get('page/description')
        if (this.wfDraftId) {
          await this.$apollo.mutate({
            mutation: gql`mutation($id: Int!, $c: String, $t: String, $d: String) { pages { updateDraft(id: $id, content: $c, title: $t, description: $d) { responseResult { succeeded message } } } }`,
            variables: { id: this.wfDraftId, c: content, t: title, d: description }
          })
        } else {
          const resp = await this.$apollo.mutate({
            mutation: gql`mutation($id: Int!, $c: String, $t: String, $d: String) { pages { createDraft(pageId: $id, content: $c, title: $t, description: $d) { responseResult { succeeded message } draft { id } } } }`,
            variables: { id: this.pageId, c: content, t: title, d: description }
          })
          this.wfDraftId = _.get(resp, 'data.pages.createDraft.draft.id', null)
        }
        this.initContentParsed = content
        this.setCurrentSavedState()
        this.$store.commit('showNotification', { style: 'success', icon: 'check', message: this.$t('editor:managed.draftSaved') })
      } catch (err) {
        this.$store.commit('showNotification', { style: 'red', icon: 'alert', message: err.message })
      }
      this.isSaving = false
    },
    async submitWfDraft () {
      if (!this.wfDraftId) { return }
      try {
        await this.$apollo.mutate({
          mutation: gql`mutation($id: Int!) { pages { submitDraft(id: $id) { responseResult { succeeded message } } } }`,
          variables: { id: this.wfDraftId }
        })
        this.$store.commit('showNotification', { style: 'success', icon: 'check', message: this.$t('editor:managed.draftSubmitted') })
        this.exitConfirmed = true
        window.location.assign(`/${this.$store.get('page/locale')}/${this.$store.get('page/path')}`)
      } catch (err) {
        this.$store.commit('showNotification', { style: 'red', icon: 'alert', message: err.message })
      }
    },
    async save({ rethrow = false, overwrite = false } = {}) {
      // Explicit draft editing, OR a non-manager editing a managed page -> save
      // to the draft instead of publishing to the live page.
      if (this.draftMode || (this.mode !== 'create' && this.wfManaged && !this.wfCanManage)) {
        return this.saveAsDraft()
      }
      this.showProgressDialog('saving')
      this.isSaving = true

      const saveTimeoutHandle = setTimeout(() => {
        throw new Error('Save operation timed out.')
      }, 30000)

      try {
        if (this.$store.get('editor/mode') === 'create') {
          // --------------------------------------------
          // -> CREATE PAGE
          // --------------------------------------------

          let resp = await this.$apollo.mutate({
            mutation: gql`
              mutation (
                $content: String!
                $description: String!
                $editor: String!
                $isPrivate: Boolean!
                $isPublished: Boolean!
                $locale: String!
                $path: String!
                $publishEndDate: Date
                $publishStartDate: Date
                $scriptCss: String
                $scriptJs: String
                $tags: [String]!
                $title: String!
              ) {
                pages {
                  create(
                    content: $content
                    description: $description
                    editor: $editor
                    isPrivate: $isPrivate
                    isPublished: $isPublished
                    locale: $locale
                    path: $path
                    publishEndDate: $publishEndDate
                    publishStartDate: $publishStartDate
                    scriptCss: $scriptCss
                    scriptJs: $scriptJs
                    tags: $tags
                    title: $title
                  ) {
                    responseResult {
                      succeeded
                      errorCode
                      slug
                      message
                    }
                    page {
                      id
                      updatedAt
                    }
                  }
                }
              }
            `,
            variables: {
              content: this.$store.get('editor/content'),
              description: this.$store.get('page/description'),
              editor: this.$store.get('editor/editorKey'),
              locale: this.$store.get('page/locale'),
              isPrivate: false,
              isPublished: this.$store.get('page/isPublished'),
              path: this.$store.get('page/path'),
              publishEndDate: this.$store.get('page/publishEndDate') || '',
              publishStartDate: this.$store.get('page/publishStartDate') || '',
              scriptCss: this.$store.get('page/scriptCss'),
              scriptJs: this.$store.get('page/scriptJs'),
              tags: this.$store.get('page/tags'),
              title: this.$store.get('page/title')
            }
          })
          resp = _.get(resp, 'data.pages.create', {})
          if (_.get(resp, 'responseResult.succeeded')) {
            this.checkoutDateActive = _.get(resp, 'page.updatedAt', this.checkoutDateActive)
            this.isConflict = false
            this.$store.commit('showNotification', {
              message: this.$t('editor:save.createSuccess'),
              style: 'success',
              icon: 'check'
            })
            this.$store.set('editor/id', _.get(resp, 'page.id'))
            this.$store.set('editor/mode', 'update')
            this.exitConfirmed = true
            window.location.assign(`/${this.$store.get('page/locale')}/${this.$store.get('page/path')}`)
          } else {
            throw new Error(_.get(resp, 'responseResult.message'))
          }
        } else {
          // --------------------------------------------
          // -> UPDATE EXISTING PAGE
          // --------------------------------------------

          const conflictResp = await this.$apollo.query({
            query: gql`
              query ($id: Int!, $checkoutDate: Date!) {
                pages {
                  checkConflicts(id: $id, checkoutDate: $checkoutDate)
                }
              }
            `,
            fetchPolicy: 'network-only',
            variables: {
              id: this.pageId,
              checkoutDate: this.checkoutDateActive
            }
          })
          if (_.get(conflictResp, 'data.pages.checkConflicts', false)) {
            this.$root.$emit('saveConflict')
            throw new Error(this.$t('editor:conflict.warning'))
          }

          let resp = await this.$apollo.mutate({
            mutation: gql`
              mutation (
                $id: Int!
                $content: String
                $description: String
                $editor: String
                $isPrivate: Boolean
                $isPublished: Boolean
                $locale: String
                $path: String
                $publishEndDate: Date
                $publishStartDate: Date
                $scriptCss: String
                $scriptJs: String
                $tags: [String]
                $title: String
              ) {
                pages {
                  update(
                    id: $id
                    content: $content
                    description: $description
                    editor: $editor
                    isPrivate: $isPrivate
                    isPublished: $isPublished
                    locale: $locale
                    path: $path
                    publishEndDate: $publishEndDate
                    publishStartDate: $publishStartDate
                    scriptCss: $scriptCss
                    scriptJs: $scriptJs
                    tags: $tags
                    title: $title
                  ) {
                    responseResult {
                      succeeded
                      errorCode
                      slug
                      message
                    }
                    page {
                      updatedAt
                    }
                  }
                }
              }
            `,
            variables: {
              id: this.$store.get('page/id'),
              content: this.$store.get('editor/content'),
              description: this.$store.get('page/description'),
              editor: this.$store.get('editor/editorKey'),
              locale: this.$store.get('page/locale'),
              isPrivate: false,
              isPublished: this.$store.get('page/isPublished'),
              path: this.$store.get('page/path'),
              publishEndDate: this.$store.get('page/publishEndDate') || '',
              publishStartDate: this.$store.get('page/publishStartDate') || '',
              scriptCss: this.$store.get('page/scriptCss'),
              scriptJs: this.$store.get('page/scriptJs'),
              tags: this.$store.get('page/tags'),
              title: this.$store.get('page/title')
            }
          })
          resp = _.get(resp, 'data.pages.update', {})
          if (_.get(resp, 'responseResult.succeeded')) {
            this.checkoutDateActive = _.get(resp, 'page.updatedAt', this.checkoutDateActive)
            this.isConflict = false
            this.$store.commit('showNotification', {
              message: this.$t('editor:save.updateSuccess'),
              style: 'success',
              icon: 'check'
            })
            if (this.locale !== this.$store.get('page/locale') || this.path !== this.$store.get('page/path')) {
              _.delay(() => {
                window.location.replace(`/e/${this.$store.get('page/locale')}/${this.$store.get('page/path')}`)
              }, 1000)
            }
          } else {
            throw new Error(_.get(resp, 'responseResult.message'))
          }
        }

        this.initContentParsed = this.$store.get('editor/content')
        this.setCurrentSavedState()
      } catch (err) {
        this.$store.commit('showNotification', {
          message: err.message,
          style: 'error',
          icon: 'warning'
        })
        if (rethrow === true) {
          clearTimeout(saveTimeoutHandle)
          this.isSaving = false
          this.hideProgressDialog()
          throw err
        }
      }
      clearTimeout(saveTimeoutHandle)
      this.isSaving = false
      this.hideProgressDialog()
    },
    async saveAndClose() {
      try {
        if (this.$store.get('editor/mode') === 'create') {
          await this.save()
        } else {
          await this.save({ rethrow: true })
          await this.exit()
        }
      } catch (err) {
        // Error is already handled
      }
    },
    async exit() {
      if (this.isDirty) {
        this.dialogUnsaved = true
      } else {
        this.exitGo()
      }
    },
    exitGo() {
      this.$store.commit(`loadingStart`, 'editor-close')
      this.currentEditor = ''
      this.exitConfirmed = true
      _.delay(() => {
        if (this.$store.get('editor/mode') === 'create') {
          window.location.assign(`/`)
        } else {
          window.location.assign(`/${this.$store.get('page/locale')}/${this.$store.get('page/path')}`)
        }
      }, 500)
    },
    setCurrentSavedState () {
      this.savedState = {
        description: this.$store.get('page/description'),
        isPublished: this.$store.get('page/isPublished'),
        publishEndDate: this.$store.get('page/publishEndDate') || '',
        publishStartDate: this.$store.get('page/publishStartDate') || '',
        tags: this.$store.get('page/tags'),
        title: this.$store.get('page/title'),
        css: this.$store.get('page/scriptCss'),
        js: this.$store.get('page/scriptJs')
      }
    },
    injectCustomCss: _.debounce(css => {
      const oldStyl = document.querySelector('#editor-script-css')
      if (oldStyl) {
        document.head.removeChild(oldStyl)
      }
      if (!_.isEmpty(css)) {
        const styl = document.createElement('style')
        styl.type = 'text/css'
        styl.id = 'editor-script-css'
        document.head.appendChild(styl)
        styl.appendChild(document.createTextNode(css))
      }
    }, 1000)
  },
  apollo: {
    isConflict: {
      query: gql`
        query ($id: Int!, $checkoutDate: Date!) {
          pages {
            checkConflicts(id: $id, checkoutDate: $checkoutDate)
          }
        }
      `,
      fetchPolicy: 'network-only',
      pollInterval: 5000,
      variables () {
        return {
          id: this.pageId,
          checkoutDate: this.checkoutDateActive
        }
      },
      update: (data) => _.cloneDeep(data.pages.checkConflicts),
      skip () {
        return this.mode === 'create' || this.isSaving || !this.isDirty
      }
    }
  }
}
</script>

<style lang='scss'>

  .editor {
    background-color: mc('grey', '900') !important;
    min-height: 100vh;

    .application--wrap {
      background-color: mc('grey', '900');
    }

    &-title-input input {
      text-align: center;
    }
  }

  .atom-spinner.is-inline {
    display: inline-block;
  }

</style>
