import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  GATE_PRESETS,
  createGatePresetRegistry,
  resolveGatePreset
} from '../src/gate-presets.js'

describe('gate preset registry', () => {
  it('normalizes custom manual and command presets without mutating built-ins', () => {
    const registry = createGatePresetRegistry({
      'team:manual': {
        description: ' Team signoff '
      },
      'team:command': {
        type: 'command',
        description: ' Run team checks ',
        command: ' npm run team:check '
      }
    })

    assert.equal(registry['node:test'], GATE_PRESETS['node:test'])
    assert.deepEqual(registry['team:manual'], {
      type: 'manual',
      description: 'Team signoff',
      command: ''
    })
    assert.deepEqual(registry['team:command'], {
      type: 'command',
      description: 'Run team checks',
      command: 'npm run team:check'
    })
    assert.equal(Object.isFrozen(registry), true)
    assert.equal(Object.isFrozen(registry['team:command']), true)
  })

  it('rejects invalid custom preset registries', () => {
    const cases = [
      ['not-object', /Workflow gatePresets must be an object/],
      [{ 'node:test': { type: 'manual' } }, /conflicts with a built-in preset/],
      [{ 'team:bad': null }, /Custom gate preset "team:bad" must be an object/],
      [
        { 'team:bad': { type: 'manual', owner: 'lead' } },
        /Custom gate preset "team:bad" contains unknown field "owner"/
      ],
      [
        { 'team:bad': { type: 'invalid' } },
        /Custom gate preset "team:bad" type must be "manual" or "command"/
      ],
      [
        { 'team:bad': { type: 'command' } },
        /Custom gate preset "team:bad" command must be a non-empty string/
      ]
    ]

    for (const [presets, message] of cases) {
      assert.throws(() => createGatePresetRegistry(presets), message)
    }
  })

  it('rejects unknown presets during resolution', () => {
    assert.throws(
      () => resolveGatePreset('team:missing'),
      /Unknown gate preset "team:missing"/
    )
  })
})
