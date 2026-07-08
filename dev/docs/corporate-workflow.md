# Corporate Documentation Workflow

This fork adds four interrelated features that make Wiki.js usable as a
controlled corporate documentation system:

1. **Watch** — subscribe to a page and get a debounced email digest when its
   published content changes.
2. **Managed pages** — restrict direct publishing to designated managers;
   everyone else proposes changes through collaborative **drafts**.
3. **Review / Approve** — per-revision sign-off by designated approvers, with an
   "Approved" badge when a page is fully approved.
4. **Groups everywhere** — watchers, managers and approvers can be individual
   users *or* whole groups, expanded to live membership at evaluation time.

All permission checks are enforced **server-side** in the GraphQL
resolvers/models (`server/graph/resolvers/pageWorkflow.js`,
`server/models/pages.js`), never only in the UI.

---

## Data model

Migration `server/db/migrations{,-sqlite}/2.5.129.js` adds:

| Table | Purpose |
|---|---|
| `pageWatchers` | watch subscriptions (`userId` **XOR** `groupId`) |
| `pageManagers` | who may publish/manage a managed page (user or group) |
| `pageApprovers` | who must approve each revision (user or group) |
| `pageDrafts` | full editable copies of a managed page (`open` \| `submitted`) |
| `pageApprovals` | per-user record of which `pageHistory` version they approved |
| `pagePendingNotifications` | debounce queue — one row per page with pending changes |

New `pages` columns: `isManaged` (bool), `approvalMode` (`off`\|`review`\|`approve`),
`watchNotifyDelayMins` (int, nullable → falls back to the site default, 30 min).

### Subject rows (user XOR group)

Every watcher/manager/approver row references **exactly one** of `userId` or
`groupId`, validated by `server/helpers/subjects.js#validateSubject`. At
notification / permission-evaluation time, `resolveSubjectUserIds` expands each
group to its **current** membership (via the `userGroups` join table) and
de-duplicates the resulting user set. A user reachable both directly and through
one or more groups gets a single email and a single approval slot.

---

## Feature 1 — Watch

- Any reader may watch/unwatch **themselves** (`watch` / `unwatch`). Managers and
  admins may assign **other** users or groups (`setWatchers`).
- The watcher list is openly visible on the page (sidebar workflow panel).
- When a watched page's **published** content changes, `pages.updatePage`
  (and `createPage`) call `workflow.onPagePublished`, which upserts a row in
  `pagePendingNotifications`.

### Debounce behavior

The `dispatch-watch-notifications` job (registered in `server/app/data.yml` at
`PT1M`, the scheduler's finest cadence) drains the queue:

- For each pending page, if `now − lastChangeAt ≥ effective delay`, it sends
  **one** consolidated digest covering `lastNotifiedVersionId → current`, then
  deletes the row.
- Further edits during the quiet period just push `lastChangeAt` forward, so a
  burst of edits coalesces into a single email.
- The **baseline** version stored when a fresh row is created is the history
  snapshot produced by that publish (whose content is the previously-live
  state), so successive digests never overlap or repeat.
- The **last editor is excluded** from the recipient set for that cycle (but
  stays on the watch list). Draft edits never enqueue a notification.

The digest email includes author, timestamp, a compact stats line
(`+42 / −7 lines across 3 sections`), a link to the page, and a link to the diff
(`/h/<locale>/<path>?diff=<from>,<to>`, honored by the history view).

---

## Feature 2 — Managed pages

- A page flagged `isManaged` may be published directly only by admins
  (`manage:pages` / `manage:system`) and its assigned managers. Direct saves by
  anyone else are rejected in `pages.updatePage` (the guard bypasses only for
  `isDraftPublish`).
- The managed-page panel **shows who the managers are** — hover or click the
  "Managed page" label to reveal the assigned users/groups.
- **Drafts** (`pageDrafts`) are full editable copies that never touch the live
  page or its history until published. **Deliberately, any user who can author a
  draft may edit or delete any draft** on the page (collaborative by design — see
  the code comments in `pageWorkflow.js`).
- **Drafts are edited in the full page editor**, not a cut-down form. "New draft"
  / "Edit draft" open the normal editor at `/e/<locale>/<path>?draft=<id>`;
  `editor.vue` detects the `?draft` param, loads the draft's
  content/title/description/editorKey into the editor store **before** the child
  editor mounts (so it renders the draft, not the live page), and routes **Save**
  to `updateDraft`. The complete markdown/visual editor — live preview, image
  paste, toolbar, page properties — is available, and **Submit for review** stays
  in the banner. Drafts remain rows in `pageDrafts` (they are **not** real pages),
  so they never appear in search, the page tree, navigation, links or the sitemap.
- A draft can be **submitted** → managers are emailed with a link to a
  side-by-side diff review. Managers **publish** (applies through the normal
  `updatePage` pipeline, recording the submitter as author and the manager as the
  acting publisher, then deletes the draft) or **reject** (returns it to `open`
  with an optional comment emailed to the submitter).
- The editor proactively routes managed-page non-managers into draft mode: a
  normal edit of a managed page transparently becomes a draft (banner +
  save-as-draft in `editor.vue`).
- **Draft-authoring access**: because drafts open the real editor (which requires
  `write:pages`), authoring a draft currently requires page-edit rights rather
  than read-only access. This narrows the "any reader can draft" intent; a
  read-only draft-only editor mode is a possible future refinement.

---

## Feature 3 — Review / Approve

- `approvalMode` is `off`, `review`, or `approve`. `review` and `approve` are
  functionally identical; only the wording differs, centralized in one place
  (`workflow.approvalWording` on the server, `common:workflow.*` on the client).
- On every publish (mode ≠ off) `workflow.requestApproval` emails all approvers.
  Approvers who previously approved an earlier revision get a **delta** email
  (summary + diff since their last approved version); first-timers get a link to
  the full page. Approval can also be requested manually (`requestApproval`).
- Approvals are **per-revision**. The current revision id is the page's latest
  `pageHistory` id (monotonic — one per publish). `computeApprovalStatus`
  marks an approver "approved" only if their `approvedVersionId` equals the
  current revision id; any later publish silently un-approves everyone until they
  re-approve. The status list is openly visible.
- In `approve` mode, when **every** current approver has approved the current
  revision, the page shows a prominent **Approved** badge/banner. `review` mode
  shows "Reviewed by X of Y" without the formal badge.
- Approvers approve with one click (`approve`, must be logged in) or **request
  changes** with a comment (`requestChanges`, emails the last editor + managers).

---

## Feature 4 — Groups everywhere (semantics)

- Watchers, managers and approvers all accept groups.
- Group membership is resolved **at evaluation time**, never snapshotted. If a
  user joins an approver group after others approved, they **immediately** count
  as a pending approver for the current revision — which can move a fully-approved
  page back to pending. **This is correct and intended** (documented in
  `pageApprovals.js` and `workflow.computeApprovalStatus`).
- Approval completeness in `approve` mode = every user in the currently-resolved
  approver set has approved the current revision.
- A user reachable via multiple paths is de-duplicated into a single email and a
  single approval slot.

---

## Site presentation options

Three site-level toggles (**Admin → General → Features**) support controlled /
corporate deployments. They live in the existing `config.features` block, are
exposed to the client via `siteConfig`, and are edited through the standard
`site.updateConfig` mutation.

- **Private site** (`featurePrivateSite`) — hides every social share target in a
  page's share menu (Facebook, Twitter, LinkedIn, Reddit, Telegram, Viber,
  Weibo, WhatsApp), leaving only **Copy URL** and **Email**
  (`client/components/common/social-sharing.vue`).
- **Hide "Powered by Wiki.js"** (`featureHidePoweredBy`) — removes the
  attribution (and its separator) from the footer, which also covers the print
  output (`client/themes/default/components/nav-footer.vue`).
- **Print QR code** (`featurePrintQRCode`) — when a page is printed, shows a QR
  code linking to it in the page-title header, next to the page name. The QR is
  generated server-side with the existing `qr-image` dependency and injected as
  inline `<svg>` (`server/controllers/common.js` → `page.vue`).
  - **Print gotcha (documented for future maintainers):** the QR is inline SVG,
    not a data-URI `<img>` (data-URI images are dropped from printed output), and
    it is **absolutely positioned, never floated** — a floated element is
    silently dropped from the printed page inside the theme's flex/print layout.
    Both were confirmed by rendering the running page to PDF with headless
    Chrome; that (not on-screen inspection) is the reliable way to debug print.

---

## GraphQL surface

All fields live under the existing `Query.pages` / `Mutation.pages` namespaces
(`server/graph/schemas/pageWorkflow.graphql`):

- Queries: `watchers`, `isWatching`, `managers`, `drafts`, `draft`, `approvers`,
  `approvalStatus`, `workflowState`, `assignableGroups`.
- Mutations: `watch`, `unwatch`, `setWatchers`, `setWatchDelay`, `setManaged`,
  `setManagers`, `createDraft`, `updateDraft`, `deleteDraft`, `submitDraft`,
  `publishDraft`, `rejectDraft`, `setApprovalMode`, `setApprovers`,
  `requestApproval`, `approve`, `requestChanges`.

## Email templates

`server/templates/workflow-*.html` (lodash `_.template` HTML, consistent with the
existing account emails): `watch-digest`, `draft-submitted`, `draft-rejected`,
`approval-requested` (first-time + delta copy), `changes-requested`.

### Mail-failure admin alert

Because these workflows depend on email, a failed send must not stay silent.
`server/core/mail.js#send` records any failure — an SMTP/transport error **or**
"mail not configured" on an attempted send — into a single `settings` row via
`server/helpers/mailStatus.js` (aggregated: count, first/last time, last error,
last template). The admin-gated GraphQL `system.mailFailure` query exposes it and
`system.dismissMailFailure` clears it. In the client, `nav-header.vue` shows a
dismissible red banner to any `manage:system` admin, on every page, while an
unacknowledged failure exists — so an admin logging in is alerted that
notifications may not be reaching users. (Detects send failures; true bounce /
delivery tracking would require provider webhooks and is out of scope.)

## i18n

New user-facing strings live in `server/locales/en.yml` under the `common` and
`editor` namespaces, including the Review/Approve wording variants. This fork
loads `server/locales/<code>.yml` unconditionally (upstream only did so in dev),
so the custom keys resolve in production images too, merged over the official
DB-sourced strings.

## Tests

`server/test/workflow/` (Jest): subject group-expansion/dedup, change-stat +
per-revision approval semantics (including group-driven un-approval), the
debounce queue's coalescing + drain (author exclusion, quiet-period gating), and
server-side enforcement (managed-page rejection, non-approver rejection, draft
publish pipeline recording the submitter as author).
