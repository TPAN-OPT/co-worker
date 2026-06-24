#!/usr/bin/env node

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const roots = ['src', 'test', 'scripts']
const files = roots.flatMap((root) => listJavaScriptFiles(root)).sort()

if (files.length === 0) {
  throw new Error('No JavaScript files found to check.')
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  })

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout)
    process.exit(result.status || 1)
  }
}

console.log(`Checked ${files.length} JavaScript files.`)

function listJavaScriptFiles(root) {
  if (!exists(root)) {
    return []
  }

  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      return listJavaScriptFiles(path)
    }

    return path.endsWith('.js') || path.endsWith('.mjs') ? [path] : []
  })
}

function exists(path) {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}
