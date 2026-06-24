import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

describe('CLI edge cases', () => {
  it('documents Node script prerequisites in init and compile help', async () => {
    const initHelp = await execFileAsync('node', [cliPath, 'init', '--help'])
    const compileHelp = await execFileAsync('node', [cliPath, 'compile', '--help'])

    assert.match(initHelp.stdout, /default production-feature template uses npm test/)
    assert.match(compileHelp.stdout, /npm-based gates require package.json scripts/)
  })

  it('rejects invalid external gate preset registry JSON during validation', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-edge-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')
    const presetPath = join(targetDir, 'gate-presets.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'invalid-external-registry-workflow',
          version: '1.0.0',
          roles: {
            engineer: {
              skills: ['tdd-workflow'],
              permissions: ['run_tests']
            }
          },
          stages: [
            {
              id: 'implement',
              owner: 'engineer',
              gates: [
                {
                  id: 'unit_tests_pass',
                  preset: 'org:test'
                }
              ]
            }
          ]
        })
      )
      await writeFile(presetPath, '{"gatePresets": ')

      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'validate',
            '--workflow',
            workflowPath,
            '--preset-file',
            presetPath
          ]),
        /Failed to parse gate preset registry JSON/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects external gate preset registries without a gatePresets object', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-edge-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')
    const presetPath = join(targetDir, 'gate-presets.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'missing-gate-presets-workflow',
          version: '1.0.0',
          roles: {
            engineer: {
              skills: ['tdd-workflow'],
              permissions: ['run_tests']
            }
          },
          stages: [
            {
              id: 'implement',
              owner: 'engineer',
              gates: [
                {
                  id: 'unit_tests_pass',
                  preset: 'org:test'
                }
              ]
            }
          ]
        })
      )
      await writeFile(presetPath, JSON.stringify({ presets: {} }))

      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'validate',
            '--workflow',
            workflowPath,
            '--preset-file',
            presetPath
          ]),
        /must include a gatePresets object/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects duplicate gate presets across external registry files during compile', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-edge-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')
    const firstPresetPath = join(targetDir, 'gate-presets-a.json')
    const secondPresetPath = join(targetDir, 'gate-presets-b.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'duplicate-external-registry-workflow',
          version: '1.0.0',
          roles: {
            engineer: {
              skills: ['tdd-workflow'],
              permissions: ['run_tests']
            }
          },
          stages: [
            {
              id: 'implement',
              owner: 'engineer',
              gates: [
                {
                  id: 'unit_tests_pass',
                  preset: 'org:test'
                }
              ]
            }
          ]
        })
      )
      await writeFile(
        firstPresetPath,
        JSON.stringify({
          gatePresets: {
            'org:test': {
              type: 'command',
              description: 'Run tests.',
              command: 'npm test'
            }
          }
        })
      )
      await writeFile(
        secondPresetPath,
        JSON.stringify({
          gatePresets: {
            'org:test': {
              type: 'manual',
              description: 'Manually verified.'
            }
          }
        })
      )

      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'compile',
            '--workflow',
            workflowPath,
            '--preset-file',
            firstPresetPath,
            '--preset-file',
            secondPresetPath,
            '--out',
            join(targetDir, 'compiled')
          ]),
        /Duplicate gate preset "org:test"/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
