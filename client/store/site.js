import { make } from 'vuex-pathify'

/* global siteConfig */

const state = {
  company: siteConfig.company,
  contentLicense: siteConfig.contentLicense,
  footerOverride: siteConfig.footerOverride,
  dark: siteConfig.darkMode,
  tocPosition: siteConfig.tocPosition,
  mascot: true,
  title: siteConfig.title,
  logoUrl: siteConfig.logoUrl,
  privateSite: siteConfig.privateSite,
  hidePoweredBy: siteConfig.hidePoweredBy,
  printQRCode: siteConfig.printQRCode,
  search: '',
  searchIsFocused: false,
  searchIsLoading: false,
  searchRestrictLocale: false,
  searchRestrictPath: false,
  printView: false
}

export default {
  namespaced: true,
  state,
  mutations: make.mutations(state)
}
