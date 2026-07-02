const resolver = require('../../graph/resolvers/pageWorkflow')
const { chain, fakeErrors } = require('./_helpers')

const ctx = { req: { user: { id: 9 } } }
const page = { id: 1, path: 'p', localeCode: 'en', isPrivate: false, description: 'd', title: 't', content: 'c', publishStartDate: '', publishEndDate: '' }

describe('managed-page permission enforcement (server-side)', () => {
  test('setManaged is rejected for a non-manager, non-admin user', async () => {
    global.WIKI = {
      Error: fakeErrors(),
      auth: { checkAccess: jest.fn(() => false) }, // no manage:pages / manage:system
      models: {
        pages: { query: jest.fn(() => chain(page)) },
        pageManagers: { isManager: jest.fn(() => Promise.resolve(false)) }
      }
    }
    const res = await resolver.PageMutation.setManaged({}, { pageId: 1, isManaged: true }, ctx)
    expect(res.responseResult.succeeded).toBe(false)
    expect(res.responseResult.slug).toBe('PageUpdateForbidden')
  })

  test('setManaged succeeds for an admin (manage:system)', async () => {
    global.WIKI = {
      Error: fakeErrors(),
      auth: { checkAccess: jest.fn(() => true) },
      models: {
        pages: { query: jest.fn(() => chain(page)) },
        pageManagers: { isManager: jest.fn(() => Promise.resolve(false)) }
      }
    }
    const res = await resolver.PageMutation.setManaged({}, { pageId: 1, isManaged: true }, ctx)
    expect(res.responseResult.succeeded).toBe(true)
  })

  test('approve is rejected when the acting user is not a current approver', async () => {
    global.WIKI = {
      Error: fakeErrors(),
      auth: { checkAccess: jest.fn(() => true) }, // can read
      models: {
        pages: { query: jest.fn(() => chain(page)) },
        pageApprovers: { getByPage: jest.fn(() => Promise.resolve([{ userId: 1 }])) } // user 9 not in set
      }
    }
    const res = await resolver.PageMutation.approve({}, { pageId: 1 }, ctx)
    expect(res.responseResult.succeeded).toBe(false)
    expect(res.responseResult.slug).toBe('PageUpdateForbidden')
  })
})

describe('draft publish routes through the normal save pipeline', () => {
  test('publishDraft records the submitter as author and deletes the draft', async () => {
    const draft = { id: 3, pageId: 1, content: 'new', description: 'nd', title: 'nt', submittedBy: 7, updatedBy: 5, createdBy: 5 }
    const draftDelChain = chain(null)
    const taggedChain = chain({ tags: [{ tag: 'x' }] })
    const updatePage = jest.fn(() => Promise.resolve())

    global.WIKI = {
      Error: fakeErrors(),
      auth: { checkAccess: jest.fn(() => true) }, // manager
      models: {
        pageDrafts: {
          query: jest.fn()
            .mockReturnValueOnce(chain(draft)) // findById(draft)
            .mockReturnValueOnce(draftDelChain) // deleteById
        },
        pages: {
          query: jest.fn()
            .mockReturnValueOnce(chain(page)) // loadPage
            .mockReturnValueOnce(taggedChain), // tags fetch
          updatePage
        },
        pageManagers: { isManager: jest.fn(() => Promise.resolve(true)) }
      }
    }

    const res = await resolver.PageMutation.publishDraft({}, { id: 3 }, ctx)

    expect(res.responseResult.succeeded).toBe(true)
    expect(updatePage).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      authorId: 7, // submitter, not the publishing manager
      isDraftPublish: true,
      isPublished: true,
      tags: ['x']
    }))
    expect(draftDelChain.deleteById).toHaveBeenCalledWith(3)
  })
})
