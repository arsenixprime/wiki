<template lang='pug'>
  v-dialog(v-model='value', persistent, max-width='350', :overlay-color='color', overlay-opacity='.7')
    v-card.loader-dialog.radius-7(:color='color', dark)
      v-card-text.text-center.py-4
        component.is-inline(
          v-if='mode === `loading`'
          :is='spinnerComponent'
          :animation-duration='spinnerSpeed'
          :size='60'
          color='#FFF'
          )
        img(v-else-if='mode === `icon`', :src='`/_assets/svg/icon-` + icon + `.svg`', :alt='icon')
        .subtitle-1.white--text {{ title }}
        .caption {{ subtitle }}
</template>

<script>
import { get } from 'vuex-pathify'
import { resolveSpinner } from './spinners'

export default {
  props: {
    value: {
      type: Boolean,
      default: false
    },
    color: {
      type: String,
      default: 'blue darken-3'
    },
    title: {
      type: String,
      default: 'Working...'
    },
    subtitle: {
      type: String,
      default: 'Please wait'
    },
    mode: {
      type: String,
      default: 'loading'
    },
    icon: {
      type: String,
      default: 'checkmark'
    }
  },
  computed: {
    loadingAnimation: get('site/loadingAnimation'),
    loadingSpeed: get('site/loadingSpeed'),
    spinnerComponent () {
      return resolveSpinner(this.loadingAnimation)
    },
    spinnerSpeed () {
      return this.loadingSpeed || 1000
    }
  }
}
</script>

<style lang='scss'>
  .loader-dialog {
    transition: all .4s ease;

    .atom-spinner.is-inline {
      display: inline-block;
    }
    .caption {
      color: rgba(255,255,255,.7);
    }

    img {
      width: 80px;
    }
  }
</style>
