import semverCoerce from 'semver/functions/coerce'
import semverLte from 'semver/functions/lte'

/**
 * This fork versions releases after the upstream Wiki.js release they track,
 * with a `_jpN` suffix (e.g. `2.5.314_jp2`). That is NOT valid semver, and
 * the stock admin UI compares versions with the `semver` library, which throws
 * on it and breaks the dashboard render. These helpers compare on the
 * upstream base version instead and never throw.
 */

/**
 * Reduce a version string to its upstream base (`2.5.314_jp2` → `2.5.314`).
 * Returns null when nothing version-like can be found (e.g. `n/a`).
 */
export function baseVersion (v) {
  const parsed = semverCoerce(v)
  return parsed ? parsed.version : null
}

/**
 * True when `current` is at or ahead of `latest`, comparing upstream base
 * versions. Unknown / unparseable versions are treated as current so the UI
 * never nags (or crashes) over a string it cannot interpret.
 */
export function isVersionCurrent (latest, current) {
  const l = baseVersion(latest)
  const c = baseVersion(current)
  if (!l || !c) { return true }
  return semverLte(l, c)
}
