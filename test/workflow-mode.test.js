import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateWorkflow } from '../src/compiler.js'
import { renderWorkflowManifest } from '../src/manifest-renderer.js'

function workflow(extra = {}) {
  return {
    name: 'mode-workflow',
    version: '1.0.0',
    roles: { engineer: { skills: ['x'], permissions: ['read_repo'] } },
    stages: [{ id: 'build', owner: 'engineer', gates: ['done'] }],
    ...extra
  }
}

describe('workflow mode', () => {
  it('defaults to opt when no mode is given', () => {
    assert.equal(validateWorkflow(workflow()).mode, 'opt')
  })

  it('accepts an explicit team mode', () => {
    assert.equal(validateWorkflow(workflow({ mode: 'team' })).mode, 'team')
  })

  it('rejects an unknown mode', () => {
    assert.throws(() => validateWorkflow(workflow({ mode: 'solo' })), /Workflow mode must be one of/)
  })

  it('carries the mode into the compiled manifest', () => {
    const manifest = JSON.parse(renderWorkflowManifest(validateWorkflow(workflow({ mode: 'team' }))))
    assert.equal(manifest.mode, 'team')
  })
})
