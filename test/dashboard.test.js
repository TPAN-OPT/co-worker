import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compileWorkflow } from '../src/compiler.js'
import { latestRunPerModule, workflowDashboard } from '../src/ops-commands.js'

async function seedProject(runs) {
  const out = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-dashboard-'))
  const root = join(out, '.tpan-opt-co-worker')
  await mkdir(join(root, 'runs'), { recursive: true })
  await writeFile(
    join(root, 'workflow.manifest.json'),
    JSON.stringify({ workflow: { name: 'delivery', version: '1.0.0' }, mode: 'team' })
  )
  await writeFile(join(root, 'runs', 'index.json'), JSON.stringify({ runs }))
  return out
}

describe('latestRunPerModule', () => {
  it('keeps the newest run per module and groups unlabeled runs', () => {
    const grouped = latestRunPerModule([
      { id: 'a1', module: 'payments', finishedAt: '2026-06-29T09:00:00Z' },
      { id: 'a2', module: 'payments', finishedAt: '2026-06-29T11:00:00Z' },
      { id: 'b1', module: 'search', finishedAt: '2026-06-29T10:00:00Z' },
      { id: 'c1', finishedAt: '2026-06-29T08:00:00Z' }
    ])
    assert.deepEqual(
      grouped.map((entry) => [entry.module, entry.run.id]),
      [
        ['(unlabeled)', 'c1'],
        ['payments', 'a2'],
        ['search', 'b1']
      ]
    )
  })
})

describe('workflowDashboard', () => {
  it('renders a side-by-side table of the latest run per module', async () => {
    const out = await seedProject([
      {
        id: 'pay-2',
        module: 'payments',
        status: 'passed',
        commandPassed: true,
        allGatesPassed: true,
        finishedAt: '2026-06-29T11:00:00Z'
      },
      {
        id: 'pay-1',
        module: 'payments',
        status: 'failed',
        commandPassed: false,
        allGatesPassed: true,
        finishedAt: '2026-06-29T09:00:00Z'
      },
      {
        id: 'srch-1',
        module: 'search',
        status: 'failed',
        commandPassed: true,
        allGatesPassed: false,
        finishedAt: '2026-06-29T10:00:00Z'
      }
    ])
    try {
      const result = await workflowDashboard(out)
      assert.match(result.text, /Mode: team \(human teammates\)/)
      assert.match(result.text, /Runs: 3 across 2 modules/)
      // Latest payments run is the passing one.
      assert.match(result.text, /payments\s+pay-2\s+passed\s+pass\s+pass/)
      // Search: command passed but a gate is still failing.
      assert.match(result.text, /search\s+srch-1\s+failed\s+pass\s+fail/)
      assert.equal(result.grouped.length, 2)
    } finally {
      await rm(out, { recursive: true, force: true })
    }
  })

  it('reports an empty dashboard when no runs exist', async () => {
    const out = await seedProject([])
    try {
      const result = await workflowDashboard(out)
      assert.match(result.text, /Runs: 0 across 0 modules/)
      assert.match(result.text, /No runs recorded yet/)
    } finally {
      await rm(out, { recursive: true, force: true })
    }
  })
})

describe('local runner module flag', () => {
  it('teaches the generated run-workflow.mjs to accept --module', () => {
    const files = compileWorkflow({
      name: 'd',
      version: '1.0.0',
      roles: { eng: { skills: ['x'], permissions: ['read_repo'] } },
      stages: [{ id: 'build', owner: 'eng', gates: ['done'] }]
    })
    const runner = files.find((file) => file.path === 'scripts/run-workflow.mjs')
    assert.match(runner.content, /--module/)
    assert.match(runner.content, /module: moduleLabel/)
  })
})
