#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const checks = [
  ['lint', [npmCommand, ['run', 'lint']]],
  ['typecheck', [npmCommand, ['run', 'typecheck']]],
  ['repo health', [npmCommand, ['run', 'repo:health']]],
  ['coverage', [npmCommand, ['run', 'test:coverage']]],
  ['build', [npmCommand, ['run', 'build']]],
  ['package smoke', [npmCommand, ['run', 'pack:check']]],
  ['security audit', [npmCommand, ['audit', '--audit-level=high']]]
]

for (const [name, [command, args]] of checks) {
  console.log(`\n[verify] ${name}`)

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

console.log('\n[verify] all quality gates passed')
