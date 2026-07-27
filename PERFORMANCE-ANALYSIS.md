# Wiki.js Performance Analysis — Page Load & Save Latency

Analysis of the page **load** and **save** code paths in this Wiki.js 2.x fork, identifying
bottlenecks ranked by expected latency impact, with concrete optimization recommendations.

## Executive summary

Save latency is dominated by **work that runs synchronously inside the save request but doesn't
need to**: a forked child process per render, a second forked process that rebuilds the entire
page tree, git commits, and search indexing — all awaited before the user gets a response.
Load latency is dominated by the **client-side JavaScript bundle** (single multi-MB vendor
chunk) rather than the server, which already serves views from a binary file cache.

| # | Bottleneck | Path | Est. cost per op | Fix effort |
|---|-----------|------|------------------|-----------|
| 1 | Fresh Node process forked per page render | Save | 1–3 s | Medium |
| 2 | Full page-tree rebuild (also forked) on create/move/delete | Save | 0.5 s – many s (grows O(n²) with page count) | Medium |
| 3 | Git add+commit awaited in the request | Save | 100–500 ms+ | Low |
| 4 | Search index update awaited in the request | Save | 10 ms – 1 s (engine-dependent) | Low |
| 5 | Redundant DB round trips in `updatePage` | Save | 20–100 ms | Low |
| 6 | Single huge vendor JS bundle (webpack 4, Vuetify full install) | Load | seconds on first/cold load | Medium–High |
| 7 | Per-request pug render + full HTML in page payload | Load | 10–50 ms | Medium |
| 8 | Config-dependent: DB engine, pool size, storage/search choices | Both | varies | Low |

---

## 1. The save path, traced

A save from the editor goes through the GraphQL `pages.update` mutation into
`Page.updatePage()` (`server/models/pages.js:370`). Every step below is **sequential and
awaited** before the mutation returns to the browser:

1. `getPageFromDb(opts.id)` — fetch original page (full row incl. `content` + `render`, joined to author/creator/tags) — `pages.js:372`
2. `pageHistory.addVersion()` — copies the full page content into `pageHistory` — `pages.js:391`
3. `pages.patch(...)` — the actual update — `pages.js:426`
4. `getPageFromDb(ogPage.id)` — **re-fetch the whole page again** with all joins — `pages.js:440`
5. `tags.associateTags` — `pages.js:443`
6. `renderPage(page)` → **forks a new Node.js process** (see finding #1) — `pages.js:446`
7. `findById(page.id).select('render')` — **third fetch** of the page — `pages.js:450`
8. `cleanHTML(render)` — striptags + 5 regex passes + entity decode over the full rendered HTML, on the main thread — `pages.js:1152`
9. `searchEngine.updated(page)` — awaited; network round trip for Elasticsearch/Algolia/Azure — `pages.js:452`
10. `storage.pageEvent({event: 'updated'})` — awaited, serial per target; for git this is file write + `git check-ignore` + `git add` + `git commit` (3–4 spawned processes) — `pages.js:456`, `server/models/storage.js:180-189`, `server/modules/storage/git/storage.js:319-338`
11. `pageTree` title update, or full `movePage` (which triggers a full tree rebuild) — `pages.js:463-483`
12. `findById(page.id).select('updatedAt')` — **fourth fetch** — `pages.js:486`

`createPage` additionally runs `rebuildTree()` (finding #2) and `reconnectLinks()` on every
new page (`pages.js:336`, `pages.js:352`).

### Finding 1 — every render forks a fresh Node.js process (biggest save cost)

`Page.renderPage()` registers a scheduler job with `worker: true` (`pages.js:937-944`).
The scheduler then does `childProcess.fork('server/core/worker.js')`
(`server/core/scheduler.js:56`). That child process, per save:

- boots a new Node.js runtime and requires the config/logger core (`server/core/worker.js`)
- **creates a brand-new Knex connection pool** (`server/jobs/render-page.js:10`)
- reloads the entire config from the database (`render-page.js:11-12`)
- fetches renderer definitions from the DB and cold-requires the whole rendering pipeline —
  markdown-it plus ~15 plugin modules (`render-page.js:19-20, 29-37`)
- renders, parses the output with cheerio to build the TOC (`render-page.js:40-70`)
- patches the DB, writes the cache file, destroys the pool, exits

Process fork + module graph require + pool setup + config reload typically costs **1–3 seconds**
before a single line of markdown is rendered — on every save. This is almost certainly the bulk
of your save latency.

**Recommendations (pick one):**
- **In-process rendering.** The render is just async JS; nothing requires process isolation.
  Call the render logic directly in the main process (as a plain `require`d function), with the
  rendering pipeline (`renderers.getRenderingPipeline`) and renderer modules **memoized** so
  they're built once, not per save. This is the change with the single largest payoff.
- If isolation is desired (untrusted rendering modules, CPU fairness under load), keep a
  **persistent worker** (a `worker_threads` pool or one long-lived forked child with IPC)
  that boots once and processes render requests over messages — never fork per job.
- Either way, stop reloading config + renderer definitions from the DB per render; cache and
  invalidate on admin changes.

### Finding 2 — full page-tree rebuild on every create/move/delete, in another fork

`rebuildTree()` (`pages.js:922-929`) also runs as a forked worker (same boot tax as above), and
`server/jobs/rebuild-tree.js` then:

- loads **every page** in the wiki (`rebuild-tree.js:13`)
- for each path segment of each page does `_.find(tree, {localeCode, path})` — a **linear scan
  with a lodash object predicate** (`rebuild-tree.js:27-30`). Total complexity is
  O(pages² × depth); with a few thousand pages this alone is seconds of CPU.
- `TRUNCATE`s `pageTree` and re-inserts every row in chunks of 100 (`rebuild-tree.js:57-68`)

**Recommendations:**
- Replace `_.find(tree, {...})` with a `Map` keyed by `` `${localeCode}:${currentPath}` `` —
  turns the O(n²) scan into O(n) and is a ~10-line change even if nothing else moves.
- Better: update the tree **incrementally** — a page create/delete/move only affects its own
  ancestor chain, so insert/remove those rows instead of truncating the whole table.
- Run it in-process (or debounced in the background); a page save should not wait on it.
  Note it *is* awaited: `pages.js:336` (create), `pages.js:739` (move), `pages.js:818` (delete).

### Finding 3 — git storage sync blocks the save response

`storage.pageEvent` is awaited in the mutation (`pages.js:456`) and iterates targets **serially**
(`server/models/storage.js:180-189`). The git target's `updated()` handler does a file write,
`git check-ignore`, `git add`, and `git commit` — each a spawned git process
(`server/modules/storage/git/storage.js:319-338`). That's typically 100–500 ms, more on slow
disks/NFS. (The push happens later on the scheduled sync, so blocking the request buys no
durability guarantee beyond the local commit.)

**Recommendations:**
- Queue storage events and process them **after** the mutation responds (fire-and-forget with
  retry/logging, or a simple in-process job queue). The DB is already the source of truth;
  storage targets are replicas.
- If multiple targets are enabled, run them with `Promise.allSettled` instead of serially.

### Finding 4 — search indexing blocks the save response

`pages.js:450-452`: after the render job completes, the save re-fetches the rendered HTML,
runs `cleanHTML()` (striptags + emoji regex + entity decode + 4 more regex passes over the whole
document, on the main event loop), then awaits `searchEngine.updated(page)`. For the DB/Postgres
engines that's an extra write; for Elasticsearch/Algolia/Azure it's a **network round trip**.

**Recommendation:** move indexing to the same post-response queue as storage. Nothing in the
editor UX depends on the search index being updated before the save confirmation.

### Finding 5 — redundant DB round trips

`updatePage` fetches the full page (with author/creator/tag joins) **four times** (steps 1, 4, 7,
12 in the trace). The render job fetches it a fifth time in the child process. Individually cheap,
collectively 5+ round trips with large `content`/`render` payloads on every save.

**Recommendations:**
- Reuse the already-fetched row; apply the patch to the in-memory object instead of re-querying.
- Have the render step return `render`/`toc`/`updatedAt` (or use Postgres `RETURNING`) instead of
  separate follow-up selects.

---

## 2. The load path, traced

### Server side (already decent)

The view route (`server/controllers/common.js:417`) calls `Page.getPage()` (`pages.js:952`),
which hits a **binary file cache** first (`data/cache/<hash>.bin`, js-binary encoded —
`pages.js:1086-1106`). On a hit there is **no DB query for the page at all**; on a miss it runs
the full join query and writes the cache file. Sidebar navigation is cached in-memory for 5
minutes per locale (`server/models/navigation.js:25-60`). Auth uses the JWT payload directly —
no per-request user query (`server/core/auth.js:68-76`). Responses are gzip-compressed
(`server/master.js:38`) and static assets get `maxAge: '7d'` (`master.js:65`).

So server-side page views are mostly: file read + js-binary decode + pug render. Remaining costs:

- **Pug server-render per request** (`common.js:552`): the full rendered HTML, TOC, and sidebar
  are re-templated for every request. An HTTP-level cache (or at least `ETag`/304 handling for
  authenticated-but-unchanged pages) would help hot pages. Note `compression()` runs with default
  settings on every response — for large pages consider pre-compressed cache entries.
- **Cache-miss query** is heavy (all columns incl. full `content` even though the view only needs
  `render` — `pages.js:980-1039`).
- **First view after save fails** if the render job died: `getPage` throws "Page has no rendered
  version" (`pages.js:964`) — symptom of the fragile fork-based render, another reason for
  finding #1.

### Client side (likely your actual "slow loading")

- `dev/webpack/webpack.prod.js:255-258` configures `splitChunks: { name: 'vendor', minChunks: 2 }`
  — **every module used twice lands in one giant vendor bundle** (Vuetify, Apollo, moment +
  locales, filepond, etc.). First loads and cache-busted loads (every deploy changes the vendor
  hash) pull several MB of JS.
- webpack 4 / Babel with `core-js` polyfills for old browsers per the `browserslist`; moment +
  moment-timezone are both shipped.
- `offline-plugin` service worker pre-caches aggressively — good for repeat visits, but adds
  first-visit cost.

**Recommendations:**
- Set `splitChunks` to granular defaults (`chunks: 'all'`, sensible `maxSize`, per-package
  cacheGroups) so a content-only deploy doesn't invalidate the whole vendor bundle and initial
  route loads only what it needs.
- Verify `vuetify-loader` treeshaking is effective (it's in the build; confirm à-la-carte imports
  actually apply) — full Vuetify is ~500 KB min alone.
- Replace `moment`/`moment-timezone` on the client with `luxon` (already a server dependency) or
  at minimum strip unused locales (a `moment-timezone-data-webpack-plugin` is present — confirm
  its config actually limits the data range).
- Serve pre-compressed (brotli) assets; run `webpack-bundle-analyzer` (already a devDependency)
  to confirm where the bytes are.

---

## 3. Deployment/config factors to check (no code changes)

These can dominate either path depending on how the instance is deployed:

- **Database engine.** SQLite serializes all writes — a busy corporate wiki should be on
  PostgreSQL. Postgres also gets the faster single-query `reconnectLinks` path (`pages.js:876`).
- **Connection pool.** `pool` in `config.yml` passes straight to Knex (`server/core/db.js:141`);
  the default (max 10) is low for a busy instance behind concurrent GraphQL traffic.
- **Search engine choice.** The `db`/`postgres` engines index locally; Elasticsearch/Algolia add
  a network hop *inside the save request* (until finding #4 is fixed).
- **Storage targets.** Every enabled target runs serially in the save request (finding #3).
  Disable targets you don't need; prefer scheduled `sync` over per-save handlers where acceptable.
- **Cache directory disk.** `data/cache` is on the request path for every page view — keep it on
  local SSD, not network storage.
- **Indexes are fine** for the hot queries: `pageLinks (path, localeCode)` is indexed
  (`server/db/migrations/2.0.0.js:296`), and page lookups use the `path + localeCode` key.

## 4. How to confirm with measurements

1. **Instrument the save chain**: wrap each step of `updatePage` (history, patch, render, search,
   storage, tree) with `process.hrtime.bigint()` timing logged at debug level. One save will show
   the exact split — expect the render fork and git commit to dominate.
2. **Time the fork tax** in isolation: log timestamps at `scheduler.js:56` (fork) and at the top
   of `render-page.js` (child alive) and after `loadFromDb` — the gap is pure overhead.
3. **Client**: Chrome DevTools coverage + network tab on a cold load; `yarn build` with
   `webpack-bundle-analyzer` for the bundle map.
4. **DB**: enable slow-query logging (e.g. Postgres `log_min_duration_statement = 100`) during
   normal use.

## 5. Suggested order of attack

1. **In-process, memoized rendering** (finding 1) — biggest single save-latency win.
2. **Move storage + search off the request path** (findings 3, 4) — small, safe changes with
   immediate effect.
3. **Map-based / incremental tree rebuild** (finding 2) — the Map fix alone is trivial and
   removes the O(n²) cliff as the wiki grows.
4. **Bundle splitting + treeshaking audit** (finding 6) — biggest load-latency win.
5. **Trim redundant queries** (finding 5) and consider HTTP caching for hot pages (finding 7).
