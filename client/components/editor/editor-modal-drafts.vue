<template lang="pug">
  v-dialog(v-model='isShown', max-width='650', persistent)
    v-card
      .dialog-header.is-short.is-orange
        v-icon.mr-2(color='white') mdi-file-document-multiple-outline
        span {{$t('editor:managed.draftsTitle')}}
      v-card-text.pt-4
        .body-2 {{$t('editor:managed.draftsBody', { n: drafts.length })}}
        .caption.grey--text.text--darken-1.mt-1 {{ canManage ? $t('editor:managed.draftsHintManager') : $t('editor:managed.draftsHintAuthor') }}
        v-list.mt-3.py-0(dense, two-line)
          v-list-item.px-0(v-for='d in drafts', :key='d.id')
            v-list-item-content
              v-list-item-title.body-2 {{ d.title || $t('common:workflow.untitledDraft') }}
              v-list-item-subtitle.caption
                v-chip.mr-1(x-small, :color='d.status === `submitted` ? `orange` : `grey lighten-1`', :text-color='d.status === `submitted` ? `white` : ``') {{ d.status }}
                span {{ $t('common:workflow.lastEditedBy', { name: d.updatedByName || '?' }) }}
            v-list-item-action.flex-row.align-center
              v-btn.mr-1(small, text, color='primary', @click='review(d)')
                v-icon(left, small) mdi-file-compare
                | {{$t('common:workflow.review')}}
              v-btn(small, text, color='primary', @click='editDraft(d)')
                v-icon(left, small) mdi-pencil
                | {{$t('common:workflow.editDraft')}}
      v-card-chin
        v-btn(text, @click='back')
          v-icon(left) mdi-arrow-left
          | {{$t('editor:managed.draftsBack')}}
        v-spacer
        v-btn.px-4(color='orange', dark, @click='isShown = false') {{$t('editor:managed.draftsContinue')}}
</template>

<script>
export default {
  props: {
    value: {
      type: Boolean,
      default: false
    },
    drafts: {
      type: Array,
      default: () => []
    },
    locale: {
      type: String,
      default: 'en'
    },
    path: {
      type: String,
      default: ''
    },
    canManage: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    isShown: {
      get() { return this.value },
      set(val) { this.$emit('input', val) }
    }
  },
  methods: {
    // Each navigation leaves the editor; the parent marks the exit as confirmed
    // so the unsaved-changes prompt never fires for untouched content.
    review(d) {
      this.$emit('navigate', `/${this.locale}/${this.path}?wfdraft=${d.id}`)
    },
    editDraft(d) {
      this.$emit('navigate', `/e/${this.locale}/${this.path}?draft=${d.id}`)
    },
    back() {
      this.$emit('navigate', `/${this.locale}/${this.path}`)
    }
  }
}
</script>
