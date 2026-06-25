#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const minimumCoverage = 80

if (isMainModule()) {
  runCoverageCheck()
}

function runCoverageCheck() {
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--experimental-test-coverage',
      '--test-coverage-include=src/**',
      '--test-coverage-include=scripts/**'
    ],
    {
      encoding: 'utf8'
    }
  )

  const output = `${result.stdout || ''}${result.stderr || ''}`
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }

  const coverage = parseCoverage(output)
  const failingMetrics = Object.entries(coverage).filter(([, value]) => value < minimumCoverage)

  if (failingMetrics.length > 0) {
    for (const [metric, value] of failingMetrics) {
      console.error(`${metric} coverage ${value}% is below ${minimumCoverage}%.`)
    }

    process.exit(1)
  }

  console.log(
    `Product coverage threshold passed: lines ${coverage.lines}%, branches ${coverage.branches}%, functions ${coverage.functions}%.`
  )
}

export function parseCoverage(output) {
  const match = output.match(/^# all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/m)

  if (!match) {
    throw new Error('Unable to parse Node test coverage summary.')
  }

  return {
    lines: Number(match[1]),
    branches: Number(match[2]),
    functions: Number(match[3])
  }
}

function isMainModule() {
  return import.meta.url === pathToFileURL(process.argv[1]).href
}
