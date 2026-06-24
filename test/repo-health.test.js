import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoHealthScriptPath = resolve('scripts/repo-health.mjs')
const focusedTestSnippet = ["describe", ".only('focused', () => {})"].join('')
const skippedTestSnippet = ["it", ".skip('skipped', () => {})"].join('')
const legacyLowercaseName = ['tpan', '-opt'].join('')
const legacyUppercaseName = ['TPAN', '-OPT'].join('')
const canonicalRepoUrl = `https://github.com/${legacyUppercaseName}/co-worker`
const canonicalGitPlusUrl = `git+${canonicalRepoUrl}.git`
const canonicalSshUrl = `git@github.com:${legacyUppercaseName}/co-worker.git`
const canonicalRepoPattern = new RegExp(`github\\.com\\/${legacyUppercaseName}\\/co-worker`)

describe('repo health script', () => {
  it('passes for a healthy minimal repository', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-repo-health-'))

    try {
      await mkdir(join(targetDir, 'src'), { recursive: true })
      await mkdir(join(targetDir, 'test'), { recursive: true })
      await writeFile(join(targetDir, 'LICENSE'), 'MIT\n')
      await writeFile(join(targetDir, 'README.md'), '# Healthy Repo\n')
      await writeFile(join(targetDir, 'src', 'index.js'), 'export const value = 1\n')
      await writeFile(
        join(targetDir, 'test', 'index.test.js'),
        "import { it } from 'node:test'\n\nit('passes', () => {})\n"
      )

      const { stdout } = await execFileAsync('node', [repoHealthScriptPath], {
        cwd: targetDir
      })

      assert.match(stdout, /Repository health checked/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('fails on focused tests, skipped tests, merge conflicts, and oversized sources', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-repo-health-'))
    const oversizedSource = `${'const x = 1\n'.repeat(801)}`

    try {
      await mkdir(join(targetDir, 'src'), { recursive: true })
      await mkdir(join(targetDir, 'test'), { recursive: true })
      await writeFile(
        join(targetDir, 'src', 'huge.js'),
        oversizedSource
      )
      await writeFile(
        join(targetDir, 'test', 'focused.test.js'),
        `${focusedTestSnippet}\n${skippedTestSnippet}\n`
      )
      await writeFile(
        join(targetDir, 'README.md'),
        '<<<<<<< ours\nconflict\n=======\nother\n>>>>>>> theirs\n'
      )

      await assert.rejects(
        () =>
          execFileAsync('node', [repoHealthScriptPath], {
            cwd: targetDir
          }),
        (error) => {
          assert.match(error.stderr, /contains unresolved merge conflict markers/)
          assert.match(error.stderr, /contains focused tests/)
          assert.match(error.stderr, /contains skipped tests/)
          assert.match(error.stderr, /maximum is 800/)
          return true
        }
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('fails on legacy branding but allows the canonical GitHub repository URLs', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-repo-health-'))

    try {
      await writeFile(
        join(targetDir, 'README.md'),
        [
          'Canonical URLs:',
          canonicalRepoUrl,
          canonicalGitPlusUrl,
          canonicalSshUrl,
          '',
          'Legacy references:',
          `Visit ${legacyLowercaseName} for old docs.`,
          `${legacyUppercaseName} legacy naming still appears here.`
        ].join('\n')
      )

      await assert.rejects(
        () =>
          execFileAsync('node', [repoHealthScriptPath], {
            cwd: targetDir
          }),
        (error) => {
          assert.match(error.stderr, /contains legacy lowercase product naming/)
          assert.match(error.stderr, /contains legacy uppercase product naming/)
          assert.doesNotMatch(error.stderr, canonicalRepoPattern)
          return true
        }
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
