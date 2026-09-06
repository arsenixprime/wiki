<template lang='pug'>
  v-dialog(v-model='value', persistent, max-width='350', :overlay-color='color', overlay-opacity='.7')
    v-card.loader-dialog.radius-7(:color='cardColor', :dark='cardDark')
      v-card-text.text-center.py-4
        //- Loading mode: themed spinner (color from Admin -> Theme) on a neutral card.
        component.is-inline(
          v-if='mode === `loading`'
          :is='spinnerComponent'
          :animation-duration='spinnerSpeed'
          :size='60'
          :color='loadingColor'
          )
        //- Icon mode (e.g. success checkmark): keep the coloured card + white icon.
        img(v-else-if='mode === `icon`', :src='`/_assets/svg/icon-` + icon + `.svg`', :alt='icon')
        .subtitle-1(:class='cardDark ? `white--text` : `grey--text text--darken-3`') {{ title }}
        .caption(:class='cardDark ? `grey--text text--lighten-2` : `grey--text text--darken-1`') {{ subtitle }}
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
    loadingColor: get('site/loadingColor'),
    loadingSpeed: get('site/loadingSpeed'),
    spinnerComponent () {
      return resolveSpinner(this.loadingAnimation)
    },
    spinnerSpeed () {
      return this.loadingSpeed || 1000
    },
    // Loading mode uses a neutral card so the custom spinner colour reads well;
    // icon mode keeps the caller's coloured card (white icon/text).
    cardColor () {
      if (this.mode !== 'loading') { return this.color }
      return this.$vuetify.theme.dark ? 'grey darken-3' : 'white'
    },
    cardDark () {
      return this.mode !== 'loading' || this.$vuetify.theme.dark
    }
  }
}
</script>

<style lang='scss'>
  .loader-dialog {
    transition: all .4s ease;

    .is-inline {
      display: inline-block;
    }

    img {
      width: 80px;
    }
  }
</style>
