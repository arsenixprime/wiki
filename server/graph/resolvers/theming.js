const graphHelper = require('../../helpers/graph')
const _ = require('lodash')
const CleanCSS = require('clean-css')

/* global WIKI */

module.exports = {
  Query: {
    async theming() { return {} }
  },
  Mutation: {
    async theming() { return {} }
  },
  ThemingQuery: {
    async themes(obj, args, context, info) {
      return [{ // TODO
        key: 'default',
        title: 'Default',
        author: 'requarks.io'
      }]
    },
    async config(obj, args, context, info) {
      return {
        theme: WIKI.config.theming.theme,
        iconset: WIKI.config.theming.iconset,
        darkMode: WIKI.config.theming.darkMode,
        tocPosition: WIKI.config.theming.tocPosition || 'left',
        loadingAnimation: WIKI.config.theming.loadingAnimation || 'atom',
        loadingColor: WIKI.config.theming.loadingColor || '#1976d2',
        loadingSpeed: _.isFinite(WIKI.config.theming.loadingSpeed) ? WIKI.config.theming.loadingSpeed : 1000,
        injectCSS: new CleanCSS({ format: 'beautify' }).minify(WIKI.config.theming.injectCSS).styles,
        injectHead: WIKI.config.theming.injectHead,
        injectBody: WIKI.config.theming.injectBody
      }
    }
  },
  ThemingMutation: {
    async setConfig(obj, args, context, info) {
      try {
        if (!_.isEmpty(args.injectCSS)) {
          args.injectCSS = new CleanCSS({
            inline: false
          }).minify(args.injectCSS).styles
        }

        WIKI.config.theming = {
          ...WIKI.config.theming,
          theme: args.theme,
          iconset: args.iconset,
          darkMode: args.darkMode,
          tocPosition: args.tocPosition || 'left',
          loadingAnimation: args.loadingAnimation || 'atom',
          loadingColor: args.loadingColor || '#1976d2',
          loadingSpeed: _.isFinite(args.loadingSpeed) ? args.loadingSpeed : 1000,
          injectCSS: args.injectCSS || '',
          injectHead: args.injectHead || '',
          injectBody: args.injectBody || ''
        }

        await WIKI.configSvc.saveToDb(['theming'])

        return {
          responseResult: graphHelper.generateSuccess('Theme config updated')
        }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    }
  }
}
