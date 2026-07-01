import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { resolveRealAgentPlan } from '../src/quickstart-demo.js'

describe('resolveRealAgentPlan', () => {
  it('stays offline when --real was not requested', () => {
    assert.deepEqual(resolveRealAgentPlan({ real: false }, ['claude']), { real: false })
  })

  it('honors an explicitly requested agent when it is installed', () => {
    const plan = resolveRealAgentPlan({ real: true, agent: 'codex' }, ['claude', 'codex'])
    assert.equal(plan.real, true)
    assert.equal(plan.agentId, 'codex')
    assert.ok(plan.agentCommand.length > 0)
  })

  it('reports a requested agent that is not installed', () => {
    const plan = resolveRealAgentPlan({ real: true, agent: 'codex' }, ['claude'])
    assert.deepEqual(plan, { real: false, requestedButMissing: true, requestedAgent: 'codex' })
  })

  it('falls back to the first detected agent when none was named', () => {
    const plan = resolveRealAgentPlan({ real: true, agent: '' }, ['cursor-agent', 'claude'])
    assert.equal(plan.real, true)
    assert.equal(plan.agentId, 'cursor-agent')
  })

  it('reports when --real was asked for but no agent is on PATH', () => {
    const plan = resolveRealAgentPlan({ real: true, agent: '' }, [])
    assert.deepEqual(plan, { real: false, requestedButMissing: true, requestedAgent: '' })
  })
})
