const model = require('../../models/pagePendingNotifications')

describe('watch-notification debounce queue (enqueue coalescing)', () => {
  test('an existing pending row is coalesced: lastChangeAt patched, no new row', async () => {
    const patch = jest.fn(() => ({ where: () => Promise.resolve(1) }))
    const insert = jest.fn(() => Promise.resolve())
    global.WIKI = { models: { pagePendingNotifications: model } }
    model.query = jest.fn()
      .mockReturnValueOnce({ where: () => ({ first: () => Promise.resolve({ id: 1, pageId: 5 }) }) })
      .mockReturnValueOnce({ patch, insert })

    await model.enqueue(5)

    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ lastChangeAt: expect.any(String) }))
    expect(insert).not.toHaveBeenCalled()
  })

  test('a fresh change inserts a row carrying the baseline version', async () => {
    const insert = jest.fn(() => Promise.resolve())
    global.WIKI = { models: { pagePendingNotifications: model } }
    model.query = jest.fn()
      .mockReturnValueOnce({ where: () => ({ first: () => Promise.resolve(null) }) })
      .mockReturnValueOnce({ insert })

    await model.enqueue(5, 12)

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ pageId: 5, lastNotifiedVersionId: 12 }))
  })
})
