/* Test helpers for corporate-workflow unit tests. */

// A chainable, thenable fake Objection query builder. Every builder method
// returns the same object (so calls chain), and awaiting it resolves to
// `result`. Terminal methods like first()/max() therefore also resolve to
// `result` — set `result` to whatever that particular query() call should yield.
function chain (result) {
  const obj = {}
  const methods = [
    'findById', 'findOne', 'select', 'column', 'where', 'whereIn', 'andWhere',
    'first', 'patch', 'insert', 'insertAndFetch', 'del', 'deleteById', 'update',
    'withGraphFetched', 'modifiers', 'modifyGraph', 'orderBy', 'page', 'offset',
    'limit', 'joinRelated', 'max'
  ]
  for (const m of methods) {
    obj[m] = jest.fn(() => obj)
  }
  obj.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return obj
}

// Minimal WIKI.Error surface used by the modules under test.
function fakeErrors () {
  const make = name => class extends Error {
    constructor (msg) {
      super(msg || name)
      this.name = name
    }
  }
  return {
    InputInvalid: make('InputInvalid'),
    PageNotFound: make('PageNotFound'),
    PageViewForbidden: make('PageViewForbidden'),
    PageUpdateForbidden: make('PageUpdateForbidden')
  }
}

module.exports = { chain, fakeErrors }
