const _ = require('lodash')
const path = require('path')
const fs = require('fs-extra')

/* global WIKI */

// Resolved git info for the running build. Populated once (lazily) and cached.
let cached = null

/**
 * Determine the git branch / commit the running instance was built from.
 *
 * Resolution order (first hit wins) — designed so it works in dev, a bare-metal
 * git checkout, AND a built Docker image (where the `.git` folder is absent):
 *   1. Environment variables (GIT_BRANCH / GIT_COMMIT / GIT_COMMIT_DATE) — the
 *      simplest thing to inject at deploy time (`docker run -e GIT_BRANCH=...`).
 *   2. A build-stamped `git-version.json` at the app root (written by the fork's
 *      release workflow and baked into the image).
 *   3. A live read of the local `.git` repo via simple-git (dev / git checkout).
 *   4. Nulls when none of the above is available.
 *
 * @returns {Promise<{branch: string|null, commit: string|null, commitShort: string|null, commitDate: string|null, source: string}>}
 */
module.exports = async function getGitVersion () {
  if (cached) { return cached }

  const result = { branch: null, commit: null, commitShort: null, commitDate: null, source: 'none' }

  // 1) Environment variables
  const envBranch = process.env.GIT_BRANCH
  const envCommit = process.env.GIT_COMMIT
  if (envBranch || envCommit) {
    result.branch = envBranch || null
    result.commit = envCommit || null
    result.commitDate = process.env.GIT_COMMIT_DATE || null
    result.source = 'env'
  }

  // 2) Build-stamped file
  if (!result.commit && !result.branch) {
    try {
      const filePath = path.join(WIKI.ROOTPATH, 'git-version.json')
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath)
        result.branch = _.get(data, 'branch', null)
        result.commit = _.get(data, 'commit', null)
        result.commitDate = _.get(data, 'commitDate', null)
        result.source = 'file'
      }
    } catch (err) {
      WIKI.logger.debug(`git-version.json read failed: ${err.message}`)
    }
  }

  // 3) Live .git read
  if (!result.commit && !result.branch) {
    try {
      const gitDir = path.join(WIKI.ROOTPATH, '.git')
      if (await fs.pathExists(gitDir)) {
        const simpleGit = require('simple-git')(WIKI.ROOTPATH)
        const branch = await simpleGit.revparse(['--abbrev-ref', 'HEAD'])
        const commit = await simpleGit.revparse(['HEAD'])
        const commitDate = await simpleGit.show(['-s', '--format=%cI', 'HEAD'])
        result.branch = _.trim(branch) || null
        result.commit = _.trim(commit) || null
        result.commitDate = _.trim(commitDate) || null
        result.source = 'git'
      }
    } catch (err) {
      WIKI.logger.debug(`live git read failed: ${err.message}`)
    }
  }

  result.commitShort = result.commit ? result.commit.substring(0, 8) : null
  cached = result
  return result
}
