import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { detectAgents, realAgentCommand, knownAgentIds } from '../src/agent-detect.js'

// These tests are POSIX-oriented (executable bit). Skip the executability
// assertions on Windows, where PATHEXT — not the mode bits — decides.
const isWindows = process.platform === 'win32'

function fakeBin(name) {
  const dir = mkdtempSync(join(tmpdir(), 'tpan-agent-detect-'))
  const file = join(dir, name)
  writeFileSync(file, '#!/bin/sh\n')
  chmodSync(file, 0o755)
  return dir
}

describe('agent-detect', () => {
  it('detects a known agent that is an executable on PATH', () => {
    const dir = fakeBin('claude')
    assert.deepEqual(detectAgents({ PATH: dir }), ['claude'])
  })

  it('returns nothing when no known agent is on PATH', () => {
    const dir = fakeBin('totally-unrelated-tool')
    assert.deepEqual(detectAgents({ PATH: dir }), [])
  })

  it('returns nothing for an empty PATH', () => {
    assert.deepEqual(detectAgents({ PATH: '' }), [])
  })

  it('does not detect a non-executable file (POSIX)', { skip: isWindows }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'tpan-agent-detect-'))
    writeFileSync(join(dir, 'codex'), 'not executable')
    assert.deepEqual(detectAgents({ PATH: dir }), [])
  })

  it('builds a real agent command that targets the swap-seam artifact path', () => {
    const command = realAgentCommand('claude')
    assert.match(command, /^claude /)
    assert.match(command, /\{stage\}/)
    assert.match(command, /\{role\}/)
    assert.match(command, /\{brief\}/)
    assert.match(command, /\.tpan-opt-co-worker\/artifacts\/\{stage\}\.md/)
  })

  it('returns an empty command for an unknown agent id', () => {
    assert.equal(realAgentCommand('nope'), '')
  })

  it('exposes the known agent ids in preference order', () => {
    assert.deepEqual(knownAgentIds(), ['claude', 'codex', 'cursor-agent'])
  })
})
