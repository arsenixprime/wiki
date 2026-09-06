const workflow = require('../../helpers/workflow')
const subjects = require('../../helpers/subjects')
const { chain, fakeErrors } = require('./_helpers')

/* global WIKI */

describe('workflow change stats + wording', () => {
  test('computeChangeStats counts added/removed lines and sections', () => {
    const oldC = 'a\nb\nc\n'
    const newC = 'a\nB\nc\nd\n'
    const stats = workflow.computeChangeStats(oldC, newC)
    expect(stats.added).toBeGreaterThan(0)
    expect(stats.removed).toBeGreaterThan(0)
    expect(stats.sections).toBeGreaterThan(0)
  })

  test('computeChangeStats on identical content = no change', () => {
    const stats = workflow.computeChangeStats('same\ntext', 'same\ntext')
    expect(stats).toEqual({ added: 0, removed: 0, sections: 0 })
  })

  test('statsLine formats compactly', () => {
    expect(workflow.statsLine({ added: 42, removed: 7, sections: 3 })).toBe('+42 / −7 lines across 3 sections')
    expect(workflow.statsLine({ added: 1, removed: 0, sections: 1 })).toBe('+1 / −0 lines across 1 section')
  })

  test('approvalWording switches only the terminology', () => {
    expect(workflow.approvalWording('approve').past).toBe('Approved')
    expect(workflow.approvalWording('review').past).toBe('Reviewed')
    expect(workflow.approvalWording('approve').noun).toBe('approval')
    expect(workflow.approvalWording('review').noun).toBe('review')
  })
})

describe('per-revision approval status', () => {
  let restore
  beforeEach(() => {
    global.WIKI = {
      Error: fakeErrors(),
      models: {
        pages: { query: () => chain({ id: 1, approvalMode: 'approve' }) },
        pageApprovers: { getByPage: jest.fn(() => Promise.resolve([])) },
        pageApprovals: { getByPage: jest.fn() }
      }
    }
    // getCurrentRevisionId + subject expansion are covered elsewhere; stub here.
    restore = [
      jest.spyOn(workflow, 'getCurrentRevisionId').mockResolvedValue(5),
      jest.spyOn(subjects, 'resolveSubjectsToUsers')
    ]
  })
  afterEach(() => restore.forEach(s => s.mockRestore()))

  test('a user who approved the current revision counts as approved', async () => {
    subjects.resolveSubjectsToUsers.mockResolvedValue([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    WIKI.models.pageApprovals.getByPage.mockResolvedValue([
      { userId: 1, approvedVersionId: 5, approvedAt: 't' }, // current
      { userId: 2, approvedVersionId: 4, approvedAt: 't' } // stale
    ])
    const status = await workflow.computeApprovalStatus(1)
    expect(status.total).toBe(2)
    expect(status.approvedCount).toBe(1)
    expect(status.isComplete).toBe(false)
    expect(status.approvers.find(a => a.userId === 2).approved).toBe(false)
  })

  test('all approvers on current revision -> complete (approve mode)', async () => {
    subjects.resolveSubjectsToUsers.mockResolvedValue([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    WIKI.models.pageApprovals.getByPage.mockResolvedValue([
      { userId: 1, approvedVersionId: 5 },
      { userId: 2, approvedVersionId: 5 }
    ])
    const status = await workflow.computeApprovalStatus(1)
    expect(status.approvedCount).toBe(2)
    expect(status.isComplete).toBe(true)
  })

  test('a newly added (unapproved) group member un-completes the page', async () => {
    // Simulates a user joining an approver group after others approved.
    subjects.resolveSubjectsToUsers.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])
    WIKI.models.pageApprovals.getByPage.mockResolvedValue([
      { userId: 1, approvedVersionId: 5 },
      { userId: 2, approvedVersionId: 5 }
    ])
    const status = await workflow.computeApprovalStatus(1)
    expect(status.total).toBe(3)
    expect(status.isComplete).toBe(false)
  })

  test('zero approvers is never complete', async () => {
    subjects.resolveSubjectsToUsers.mockResolvedValue([])
    WIKI.models.pageApprovals.getByPage.mockResolvedValue([])
    const status = await workflow.computeApprovalStatus(1)
    expect(status.total).toBe(0)
    expect(status.isComplete).toBe(false)
  })
})
