const nodemailer = require('nodemailer')
const _ = require('lodash')
const fs = require('fs-extra')
const path = require('path')
const mailStatus = require('../helpers/mailStatus')

/* global WIKI */

module.exports = {
  transport: null,
  templates: {},
  init() {
    if (_.get(WIKI.config, 'mail.host', '').length > 2) {
      let conf = {
        host: WIKI.config.mail.host,
        port: WIKI.config.mail.port,
        name: WIKI.config.mail.name,
        secure: WIKI.config.mail.secure,
        tls: {
          rejectUnauthorized: !(WIKI.config.mail.verifySSL === false)
        }
      }
      if (_.get(WIKI.config, 'mail.user', '').length > 1) {
        conf = {
          ...conf,
          auth: {
            user: WIKI.config.mail.user,
            pass: WIKI.config.mail.pass
          }
        }
      }
      if (_.get(WIKI.config, 'mail.useDKIM', false)) {
        conf = {
          ...conf,
          dkim: {
            domainName: WIKI.config.mail.dkimDomainName,
            keySelector: WIKI.config.mail.dkimKeySelector,
            privateKey: WIKI.config.mail.dkimPrivateKey
          }
        }
      }
      this.transport = nodemailer.createTransport(conf)
    } else {
      WIKI.logger.warn('Mail is not setup! Please set the configuration in the administration area!')
      this.transport = null
    }
    return this
  },
  async send(opts) {
    if (!this.transport) {
      WIKI.logger.warn('Cannot send email because mail is not setup in the administration area!')
      // Record so admins are alerted that email could not be sent.
      await mailStatus.record(new Error('Mail is not configured in the administration area.'), opts.template)
      throw new WIKI.Error.MailNotConfigured()
    }
    await this.loadTemplate(opts.template)
    try {
      return await this.transport.sendMail({
        headers: {
          'x-mailer': 'Wiki.js'
        },
        from: `"${WIKI.config.mail.senderName}" <${WIKI.config.mail.senderEmail}>`,
        to: opts.to,
        subject: `${opts.subject} - ${WIKI.config.title}`,
        text: opts.text,
        html: _.get(this.templates, opts.template)({
          logo: (WIKI.config.logoUrl.startsWith('http') ? '' : WIKI.config.host) + WIKI.config.logoUrl,
          siteTitle: WIKI.config.title,
          copyright: WIKI.config.company.length > 0 ? WIKI.config.company : 'Powered by Wiki.js',
          ...opts.data
        })
      })
    } catch (err) {
      // Transport/SMTP send failure — record for the admin banner, then rethrow
      // so existing callers still see the error.
      await mailStatus.record(err, opts.template)
      throw err
    }
  },
  async loadTemplate(key) {
    if (_.has(this.templates, key)) { return }
    const keyKebab = _.kebabCase(key)
    try {
      const rawTmpl = await fs.readFile(path.join(WIKI.SERVERPATH, `templates/${keyKebab}.html`), 'utf8')
      _.set(this.templates, key, _.template(rawTmpl))
    } catch (err) {
      WIKI.logger.warn(err)
      throw new WIKI.Error.MailTemplateFailed()
    }
  }
}
