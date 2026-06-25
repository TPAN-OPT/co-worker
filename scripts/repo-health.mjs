#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const maxSourceLines = 800
const githubOrg = 'TPAN' + '-OPT'
const legacyLowercasePattern = new RegExp('tpan' + '-opt(?!-co-worker)')
const legacyUppercasePattern = new RegExp('TPAN' + '-OPT(?!\\/CO-WORKER)')
const failures = []
const files = listRepositoryFiles()

for (const file of files) {
  if (!isTextFile(file)) {
    continue
  }

  const content = readFileSync(file, 'utf8')

  checkConflictMarkers(file, content)
  checkFocusedOrSkippedTests(file, content)
  checkBranding(file, content)
  checkSourceLength(file, content)
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log(`Repository health checked ${files.length} files.`)

function listRepositoryFiles() {
  // Prefer git-tracked files so untracked, environment-generated files (for
  // example a tool's .claude/settings.local.json) are not scanned. Fall back to
  // a filesystem walk when git is unavailable or the working tree has no
  // tracked files yet, which keeps the script usable in scratch directories.
  const trackedFiles = listTrackedFiles()
  if (trackedFiles && trackedFiles.length > 0) {
    return trackedFiles.filter((file) => !file.startsWith('.git/')).sort()
  }

  return listFiles('.').filter((file) => !file.startsWith('.git/')).sort()
}

function listTrackedFiles() {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    return output.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

function listFiles(root) {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      if (['.git', 'coverage', 'node_modules'].includes(entry)) {
        return []
      }

      return listFiles(path)
    }

    return [path.replace(/^\.\//, '')]
  })
}

function isTextFile(file) {
  return /\.(cjs|css|html|js|json|md|mjs|toml|txt|yml)$/.test(file) || file === 'LICENSE'
}

function checkConflictMarkers(file, content) {
  if (/^(<<<<<<<|=======|>>>>>>>) /m.test(content)) {
    failures.push(`${file} contains unresolved merge conflict markers.`)
  }
}

function checkFocusedOrSkippedTests(file, content) {
  if (!file.startsWith('test/')) {
    return
  }

  if (/\b(?:describe|it|test)\.only\s*\(/.test(content)) {
    failures.push(`${file} contains focused tests.`)
  }

  if (/\b(?:describe|it|test)\.skip\s*\(/.test(content)) {
    failures.push(`${file} contains skipped tests.`)
  }
}

function checkBranding(file, content) {
  const normalizedContent = content
    .replaceAll(`https://github.com/${githubOrg}/co-worker`, '')
    .replaceAll(`git+https://github.com/${githubOrg}/co-worker.git`, '')
    .replaceAll(`git@github.com:${githubOrg}/co-worker.git`, '')

  if (legacyLowercasePattern.test(normalizedContent)) {
    failures.push(`${file} contains legacy lowercase product naming.`)
  }

  if (legacyUppercasePattern.test(normalizedContent)) {
    failures.push(`${file} contains legacy uppercase product naming.`)
  }
}

function checkSourceLength(file, content) {
  if (!/^(scripts|src|test)\//.test(file)) {
    return
  }

  const lineCount = content.split('\n').length

  if (lineCount > maxSourceLines) {
    failures.push(`${file} has ${lineCount} lines; maximum is ${maxSourceLines}.`)
  }
}
