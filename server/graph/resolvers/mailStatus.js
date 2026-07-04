const graphHelper = require('../../helpers/graph')
const mailStatus = require('../../helpers/mailStatus')

module.exports = {
  SystemQuery: {
    async mailFailure () {
      return mailStatus.getState()
    }
  },
  SystemMutation: {
    async dismissMailFailure () {
      try {
        await mailStatus.clear()
        return { responseResult: graphHelper.generateSuccess('Mail failure alert dismissed.') }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    }
  }
}
