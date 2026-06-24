export const GATE_PRESETS = Object.freeze({
  'node:test': Object.freeze({
    type: 'command',
    description: 'Run the Node.js test suite.',
    command: 'npm test'
  }),
  'node:coverage': Object.freeze({
    type: 'command',
    description: 'Run the Node.js coverage suite.',
    command: 'npm run test:coverage'
  }),
  'npm:lint': Object.freeze({
    type: 'command',
    description: 'Run the npm lint script.',
    command: 'npm run lint'
  }),
  'npm:typecheck': Object.freeze({
    type: 'command',
    description: 'Run the npm typecheck script.',
    command: 'npm run typecheck'
  }),
  'npm:audit-high': Object.freeze({
    type: 'command',
    description: 'Run npm audit and fail on high severity vulnerabilities.',
    command: 'npm audit --audit-level=high'
  })
})

export function createGatePresetRegistry(customPresets = {}) {
  const normalizedCustomPresets = normalizeCustomGatePresets(customPresets)

  return Object.freeze({
    ...GATE_PRESETS,
    ...normalizedCustomPresets
  })
}

export function resolveGatePreset(presetId, registry = GATE_PRESETS) {
  const preset = registry[presetId]
  if (!preset) {
    throw new Error(`Unknown gate preset "${presetId}"`)
  }

  return preset
}

function normalizeCustomGatePresets(customPresets) {
  if (customPresets === undefined) {
    return {}
  }

  if (!isPlainObject(customPresets)) {
    throw new Error('Workflow gatePresets must be an object')
  }

  return Object.fromEntries(
    Object.entries(customPresets).map(([presetId, preset]) => {
      if (Object.hasOwn(GATE_PRESETS, presetId)) {
        throw new Error(`Custom gate preset "${presetId}" conflicts with a built-in preset`)
      }

      return [presetId, normalizeCustomGatePreset(presetId, preset)]
    })
  )
}

function normalizeCustomGatePreset(presetId, preset) {
  if (!isPlainObject(preset)) {
    throw new Error(`Custom gate preset "${presetId}" must be an object`)
  }

  const type =
    typeof preset.type === 'string' && preset.type.trim() !== ''
      ? preset.type.trim()
      : 'manual'

  if (type !== 'manual' && type !== 'command') {
    throw new Error(`Custom gate preset "${presetId}" type must be "manual" or "command"`)
  }

  const command =
    typeof preset.command === 'string' && preset.command.trim() !== ''
      ? preset.command.trim()
      : ''

  if (type === 'command' && command === '') {
    throw new Error(`Custom gate preset "${presetId}" command must be a non-empty string`)
  }

  return Object.freeze({
    type,
    description:
      typeof preset.description === 'string' && preset.description.trim() !== ''
        ? preset.description.trim()
        : '',
    command
  })
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
