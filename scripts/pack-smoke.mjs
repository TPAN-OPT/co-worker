#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const cacheDir = mkdtempSync(join(tmpdir(), 'tpan-opt-co-worker-npm-cache-'))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

try {
  const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json', '--cache', cacheDir], {
    encoding: 'utf8'
  })

  if (result.status !== 0) {
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    process.exit(result.status || 1)
  }

  const packages = parsePackOutput(result.stdout)
  const files = new Set(packages.flatMap((entry) => entry.files.map((file) => file.path)))
  const requiredFiles = [
    'LICENSE',
    'README.md',
    'README.zh-CN.md',
    'examples/opt.workflow.json',
    'package.json',
    'scripts/check-coverage.mjs',
    'scripts/verify.mjs',
    'src/cli.js',
    'test/cli.test.js'
  ]

  const missingFiles = requiredFiles.filter((file) => !files.has(file))

  if (missingFiles.length > 0) {
    throw new Error(`Package smoke is missing required files: ${missingFiles.join(', ')}`)
  }

  console.log(`Package smoke contains ${files.size} files.`)
} finally {
  rmSync(cacheDir, { recursive: true, force: true })
}

function parsePackOutput(stdout) {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`Unable to parse npm pack output: ${error.message}`)
  }
}
