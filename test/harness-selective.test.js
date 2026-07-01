import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { compileWorkflow } from '../src/compiler.js'

function workflow(extra = {}) {
  return {
    name: 'harness-workflow',
    version: '1.0.0',
    roles: {
      planner: { skills: ['x'], permissions: ['read_repo'] },
      engineer: { skills: ['y'], permissions: ['write_code'] }
    },
    stages: [
      { id: 'clarify', owner: 'planner', gates: ['ok'] },
      { id: 'build', owner: 'engineer', gates: ['done'] }
    ],
    ...extra
  }
}

function paths(outputs) {
  return outputs.map((output) => output.path)
}

const CORE_SAMPLE = [
  'AGENTS.md',
  '.tpan-opt-co-worker/workflow.manifest.json',
  '.tpan-opt-co-worker/console/index.html',
  'scripts/verify-workflow.mjs',
  'scripts/orchestrate-workflow.mjs',
  '.github/workflows/tpan-opt-co-worker-verify.yml'
]

describe('harness-selective compilation', () => {
  it('emits every harness by default in opt mode (backward compatible)', () => {
    const p = paths(compileWorkflow(workflow()))
    assert.ok(p.includes('CLAUDE.md'))
    assert.ok(p.includes('.codex/config.toml'))
    assert.ok(p.includes('.cursor/rules/tpan-opt-co-worker.mdc'))
    assert.ok(p.includes('opencode.json'))
    assert.ok(p.includes('PLAYBOOK.md'))
  })

  it('emits only the selected harness plus core with --harness claude', () => {
    const p = paths(compileWorkflow(workflow(), { harnesses: ['claude'] }))

    assert.ok(p.includes('CLAUDE.md'))
    assert.ok(p.includes('.claude/agents/planner.md'))
    for (const corePath of CORE_SAMPLE) {
      assert.ok(p.includes(corePath), `expected core file ${corePath}`)
    }

    assert.ok(!p.includes('.codex/config.toml'))
    assert.ok(!p.includes('.cursor/rules/tpan-opt-co-worker.mdc'))
    assert.ok(!p.includes('opencode.json'))
    assert.ok(!p.includes('PLAYBOOK.md'))
  })

  it('unions multiple selected harnesses', () => {
    const p = paths(compileWorkflow(workflow(), { harnesses: ['codex', 'cursor'] }))
    assert.ok(p.includes('.codex/config.toml'))
    assert.ok(p.includes('.cursor/rules/tpan-opt-co-worker.mdc'))
    assert.ok(!p.includes('CLAUDE.md'))
    assert.ok(!p.includes('opencode.json'))
  })

  it('mode:team defaults to the team playbook without agent-CLI files', () => {
    const p = paths(compileWorkflow(workflow({ mode: 'team' })))

    assert.ok(p.includes('PLAYBOOK.md'))
    for (const corePath of CORE_SAMPLE) {
      assert.ok(p.includes(corePath), `expected core file ${corePath}`)
    }

    assert.ok(!p.includes('CLAUDE.md'))
    assert.ok(!p.includes('.codex/config.toml'))
    assert.ok(!p.includes('.claude/agents/planner.md'))
    assert.ok(!p.includes('opencode.json'))
  })

  it('an explicit --harness overrides the team-mode default', () => {
    const p = paths(compileWorkflow(workflow({ mode: 'team' }), { harnesses: ['claude'] }))
    assert.ok(p.includes('CLAUDE.md'))
    assert.ok(!p.includes('PLAYBOOK.md'))
  })

  it('routes a shared .mcp.json only to harnesses that read it', () => {
    const withServers = workflow({
      mcpServers: { docs: { command: 'docs-server', args: ['--stdio'] } },
      roles: {
        planner: { skills: ['x'], permissions: ['read_repo'], mcpServers: ['docs'] },
        engineer: { skills: ['y'], permissions: ['write_code'] }
      }
    })

    assert.ok(paths(compileWorkflow(withServers, { harnesses: ['cursor'] })).includes('.mcp.json'))
    // Codex carries MCP servers in .codex/config.toml, so a root .mcp.json is not
    // part of a codex-only selection.
    assert.ok(!paths(compileWorkflow(withServers, { harnesses: ['codex'] })).includes('.mcp.json'))
  })
})
