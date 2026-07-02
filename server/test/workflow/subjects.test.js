const subjects = require('../../helpers/subjects')
const { fakeErrors } = require('./_helpers')

/* global WIKI */

describe('workflow subject resolution', () => {
  beforeEach(() => {
    global.WIKI = {
      Error: fakeErrors(),
      models: {
        // group 10 -> members 2 and 3
        knex: jest.fn(() => ({
          whereIn: () => ({ select: () => Promise.resolve([{ userId: 2 }, { userId: 3 }]) })
        })),
        users: {
          query: () => ({
            select: () => ({
              whereIn: (col, ids) => Promise.resolve(ids.map(id => ({ id, name: `U${id}`, email: `u${id}@x` })))
            })
          })
        }
      }
    }
  })

  test('validateSubject requires exactly one of user/group', () => {
    expect(() => subjects.validateSubject({ userId: 1, groupId: 2 })).toThrow()
    expect(() => subjects.validateSubject({})).toThrow()
    expect(() => subjects.validateSubject({ userId: 1 })).not.toThrow()
    expect(() => subjects.validateSubject({ groupId: 2 })).not.toThrow()
  })

  test('expands groups to live membership and de-duplicates users', async () => {
    // user 2 is reachable both directly AND via group 10 -> counted once.
    const rows = [{ userId: 1, groupId: null }, { userId: null, groupId: 10 }, { userId: 2, groupId: null }]
    const ids = await subjects.resolveSubjectUserIds(rows)
    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  test('resolveSubjectsToUsers returns one record per unique user', async () => {
    const rows = [{ userId: 1 }, { groupId: 10 }, { userId: 2 }]
    const users = await subjects.resolveSubjectsToUsers(rows)
    expect(users.map(u => u.id).sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  test('no groups -> no membership query issued', async () => {
    const ids = await subjects.resolveSubjectUserIds([{ userId: 5 }])
    expect([...ids]).toEqual([5])
    expect(WIKI.models.knex).not.toHaveBeenCalled()
  })
})
