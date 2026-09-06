const subjects = require('../../helpers/subjects')
const workflow = require('../../helpers/workflow')
const { chain } = require('./_helpers')
const job = require('../../jobs/dispatch-watch-notifications')

function baseWiki (pendingRow, page) {
  const pendingChain = chain([pendingRow])
  pendingChain.deleteById = jest.fn(() => Promise.resolve())
  global.WIKI = {
    config: { host: 'http://wiki.test' },
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    models: {
      pagePendingNotifications: { query: jest.fn(() => pendingChain), _chain: pendingChain },
      pages: { query: jest.fn(() => chain(page)) },
      pageWatchers: { getByPage: jest.fn(() => Promise.resolve([{ userId: 9 }, { userId: 7 }])) },
      pageHistory: { getVersion: jest.fn(() => Promise.resolve({ content: 'old line\n' })) },
      users: { query: jest.fn(() => chain({ name: 'Author' })) }
    }
  }
  return pendingChain
}

describe('dispatch-watch-notifications (debounce drain)', () => {
  let spies
  beforeEach(() => {
    spies = [
      jest.spyOn(workflow, 'getEffectiveDelayMins').mockResolvedValue(30),
      jest.spyOn(workflow, 'getCurrentRevisionId').mockResolvedValue(9),
      jest.spyOn(workflow, '_send').mockResolvedValue(),
      // author (id 7) is excluded; only watcher 9 should receive an email
      jest.spyOn(subjects, 'resolveSubjectsToUsers').mockResolvedValue([
        { id: 9, name: 'Watcher', email: '9@x' },
        { id: 7, name: 'Author', email: '7@x' }
      ])
    ]
  })
  afterEach(() => spies.forEach(s => s.mockRestore()))

  const page = { id: 1, path: 'p', localeCode: 'en', title: 'T', authorId: 7, content: 'old line\nnew line\n', isPublished: true }

  test('sends ONE digest (author excluded) and clears the row once the quiet period elapsed', async () => {
    const row = { id: 100, pageId: 1, lastChangeAt: new Date(Date.now() - 3600 * 1000).toISOString(), lastNotifiedVersionId: 3 }
    const pendingChain = baseWiki(row, page)

    await job()

    expect(workflow._send).toHaveBeenCalledTimes(1)
    const [, to] = workflow._send.mock.calls[0]
    expect(to).toBe('9@x') // not the author
    expect(pendingChain.deleteById).toHaveBeenCalledWith(100)
  })

  test('does nothing for a row still inside the quiet period', async () => {
    const row = { id: 101, pageId: 1, lastChangeAt: new Date().toISOString(), lastNotifiedVersionId: 3 }
    const pendingChain = baseWiki(row, page)

    await job()

    expect(workflow._send).not.toHaveBeenCalled()
    expect(pendingChain.deleteById).not.toHaveBeenCalled()
  })
})
