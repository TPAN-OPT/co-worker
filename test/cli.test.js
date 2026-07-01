import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

describe('CLI', () => {
  it('prints root help with a successful exit code', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, '--help'])

    assert.ok(stdout.includes('TPAN-OPT/CO-WORKER'))
    assert.match(stdout, /tpan-opt-co-worker catalog \[--kind presets\|templates\|policies\|teams\|marketplace\]/)
    assert.match(stdout, /--harness claude\|codex\|cursor\|opencode\|team/)
    assert.match(stdout, /--template production-feature/)
    assert.match(stdout, /--team product-delivery/)
    assert.match(stdout, /--policy quality-standard/)
    assert.match(stdout, /--name workflow-name/)
  })

  it('documents template-specific init default names', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'init', '--help'])

    assert.match(stdout, /--name workflow-name/)
    assert.match(stdout, /Defaults to the selected template's default name/)
    assert.doesNotMatch(stdout, /\[--name production-feature-workflow\]/)
  })

  it('rejects unknown root commands with help', async () => {
    const productName = ['TPAN', 'OPT/CO-WORKER'].join('-')

    await assert.rejects(async () => {
      try {
        await execFileAsync('node', [cliPath, 'unknown-command'])
      } catch (error) {
        assert.ok(error.stdout.includes(productName))
        throw error
      }
    })
  })

  it('prints command help for writable and workflow commands', async () => {
    const commands = ['init', 'validate', 'schema', 'compile']

    for (const command of commands) {
      const { stdout } = await execFileAsync('node', [cliPath, command, '--help'])

      assert.match(stdout, new RegExp(`tpan-opt-co-worker ${command}`))
      assert.match(stdout, /Options:/)
    }
  })

  it('rejects unknown and incomplete workflow command options', async () => {
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'compile', '--workflow']),
      /--workflow requires a value/
    )
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'compile', '--bogus']),
      /Unknown compile option "--bogus"/
    )
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'validate', '--preset-file']),
      /--preset-file requires a value/
    )
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'schema', '--out']),
      /--out requires a value/
    )
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'init', '--policy']),
      /--policy requires a value/
    )
  })

  it('prints the workflow JSON Schema', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'schema'])
    const schema = JSON.parse(stdout)

    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(schema.title, 'TPAN-OPT/CO-WORKER Workflow')
    assert.deepEqual(schema.required, ['name', 'version', 'roles', 'stages'])
  })

  it('writes the workflow JSON Schema with overwrite protection', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const schemaPath = join(targetDir, 'workflow.schema.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'schema',
        '--out',
        schemaPath
      ])

      assert.match(stdout, /Wrote workflow schema/)
      const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
      assert.equal(schema.title, 'TPAN-OPT/CO-WORKER Workflow')

      await assert.rejects(
        () => execFileAsync('node', [cliPath, 'schema', '--out', schemaPath]),
        /Refusing to overwrite existing file/
      )

      await writeFile(schemaPath, '{}')
      await execFileAsync('node', [cliPath, 'schema', '--out', schemaPath, '--force'])
      const overwrittenSchema = JSON.parse(await readFile(schemaPath, 'utf8'))
      assert.equal(overwrittenSchema.$id, 'https://tpan-opt-co-worker.local/workflow.schema.json')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('validates a workflow file without writing generated assets', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'valid-workflow',
          version: '1.0.0',
          roles: {
            planner: {
              skills: ['product-capability'],
              permissions: ['read_repo']
            },
            engineer: {
              skills: ['tdd-workflow'],
              permissions: ['write_code', 'run_tests']
            }
          },
          stages: [
            {
              id: 'clarify',
              owner: 'planner',
              gates: ['scope_approved']
            },
            {
              id: 'implement',
              owner: 'engineer',
              gates: [
                {
                  id: 'unit_tests_pass',
                  preset: 'node:test'
                }
              ]
            }
          ]
        })
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'validate',
        '--workflow',
        workflowPath
      ])

      assert.match(stdout, /Workflow valid: valid-workflow@1\.0\.0/)
      assert.match(stdout, /Roles: 2/)
      assert.match(stdout, /Stages: 2/)
      assert.match(stdout, /Gates: 2/)
      await assert.rejects(() => readFile(join(targetDir, 'AGENTS.md'), 'utf8'), {
        code: 'ENOENT'
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('validates workflow files with external gate presets', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')
    const presetPath = join(targetDir, 'gate-presets.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'validated-external-preset-workflow',
          version: '1.0.0',
          roles: {
            reviewer: {
              skills: ['code-review'],
              permissions: ['read_diff']
            }
          },
          stages: [
            {
              id: 'review',
              owner: 'reviewer',
              gates: [
                {
                  id: 'external_review_passed',
                  preset: 'org:review'
                }
              ]
            }
          ]
        })
      )
      await writeFile(
        presetPath,
        JSON.stringify({
          gatePresets: {
            'org:review': {
              type: 'manual',
              description: 'Organization review completed.'
            }
          }
        })
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'validate',
        '--workflow',
        workflowPath,
        '--preset-file',
        presetPath
      ])

      assert.match(stdout, /Workflow valid: validated-external-preset-workflow@1\.0\.0/)
      assert.match(stdout, /Gates: 1/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('prints a machine-readable validation summary with --json', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'json-summary-workflow',
          version: '1.0.0',
          roles: {
            planner: {
              skills: ['product-capability'],
              permissions: ['read_repo']
            },
            engineer: {
              skills: ['tdd-workflow'],
              permissions: ['write_code', 'run_tests']
            }
          },
          stages: [
            {
              id: 'clarify',
              owner: 'planner',
              gates: ['scope_approved']
            },
            {
              id: 'implement',
              owner: 'engineer',
              gates: [
                {
                  id: 'unit_tests_pass',
                  preset: 'node:test'
                }
              ]
            }
          ]
        })
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'validate',
        '--workflow',
        workflowPath,
        '--json'
      ])
      const summary = JSON.parse(stdout)

      assert.equal(summary.valid, true)
      assert.deepEqual(summary.workflow, {
        name: 'json-summary-workflow',
        version: '1.0.0'
      })
      assert.deepEqual(summary.counts, {
        roles: 2,
        stages: 2,
        gates: 2,
        manualGates: 1,
        commandGates: 1
      })
      assert.deepEqual(summary.roles, ['planner', 'engineer'])
      assert.deepEqual(summary.stages, [
        {
          id: 'clarify',
          owner: 'planner',
          gateIds: ['scope_approved']
        },
        {
          id: 'implement',
          owner: 'engineer',
          gateIds: ['unit_tests_pass']
        }
      ])
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects invalid workflows during validation', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'invalid-workflow',
          version: '1.0.0',
          roles: {
            planner: {
              skills: [],
              permissions: []
            }
          },
          stages: [
            {
              id: 'implement',
              owner: 'engineer'
            }
          ]
        })
      )

      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'validate',
            '--workflow',
            workflowPath
          ]),
        /Stage "implement" references unknown owner "engineer"/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('compiles a workflow file into repository assets', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify(
          {
            name: 'cli-workflow',
            version: '1.0.0',
            roles: {
              planner: {
                skills: ['product-capability'],
                permissions: ['read_repo']
              }
            },
            stages: [
              {
                id: 'clarify',
                owner: 'planner',
                gates: ['approved_scope']
              }
            ]
          },
          null,
          2
        )
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'compile',
        '--workflow',
        workflowPath,
        '--out',
        targetDir
      ])

      assert.match(stdout, /Wrote 26 files/)
      assert.match(stdout, /\.tpan-opt-co-worker\/catalog\.json/)
      assert.match(stdout, /\.tpan-opt-co-worker\/marketplace\.json/)
      assert.match(stdout, /\.tpan-opt-co-worker\/console\/catalog\.js/)
      const agents = await readFile(join(targetDir, 'AGENTS.md'), 'utf8')
      assert.match(agents, /cli-workflow/)
      const catalog = JSON.parse(
        await readFile(join(targetDir, '.tpan-opt-co-worker', 'catalog.json'), 'utf8')
      )
      assert.equal(catalog.teams[0].id, 'product-delivery')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('narrows compiled harness files with --harness', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'harness-cli-workflow',
          version: '1.0.0',
          roles: { planner: { skills: ['x'], permissions: ['read_repo'] } },
          stages: [{ id: 'clarify', owner: 'planner', gates: ['approved'] }]
        })
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'compile',
        '--workflow',
        workflowPath,
        '--out',
        targetDir,
        '--harness',
        'claude'
      ])

      assert.match(stdout, /CLAUDE\.md/)
      assert.doesNotMatch(stdout, /\.codex\/config\.toml/)
      assert.doesNotMatch(stdout, /opencode\.json/)
      assert.doesNotMatch(stdout, /PLAYBOOK\.md/)
      // Core assets are still written regardless of harness selection.
      assert.match(stdout, /scripts\/verify-workflow\.mjs/)

      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'compile',
            '--workflow',
            workflowPath,
            '--out',
            targetDir,
            '--harness',
            'bogus'
          ]),
        /Unknown harness "bogus"/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('supports dry-run without writing files', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'dry-run-workflow',
          version: '1.0.0',
          roles: {
            reviewer: {
              skills: ['code-review'],
              permissions: ['read_diff']
            }
          },
          stages: [
            {
              id: 'review',
              owner: 'reviewer',
              gates: ['no_high_findings']
            }
          ]
        })
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'compile',
        '--workflow',
        workflowPath,
        '--out',
        targetDir,
        '--dry-run'
      ])

      assert.match(stdout, /Would write 26 files/)
      await assert.rejects(() => readFile(join(targetDir, 'AGENTS.md'), 'utf8'), {
        code: 'ENOENT'
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('compiles with external gate preset registry files', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')
    const presetPath = join(targetDir, 'gate-presets.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'external-preset-workflow',
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
                  id: 'external_check_passed',
                  preset: 'org:external-check'
                }
              ]
            }
          ]
        })
      )
      await writeFile(
        presetPath,
        JSON.stringify({
          gatePresets: {
            'org:external-check': {
              type: 'command',
              description: 'Run an organization-defined check.',
              command: 'node -e "process.exit(0)"'
            }
          }
        })
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'compile',
        '--workflow',
        workflowPath,
        '--preset-file',
        presetPath,
        '--out',
        targetDir
      ])

      assert.match(stdout, /Wrote 26 files/)
      const verifyScript = await readFile(
        join(targetDir, 'scripts', 'verify-workflow.mjs'),
        'utf8'
      )
      assert.match(verifyScript, /org:external-check/)
      assert.match(verifyScript, /node -e/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects duplicate presets across workflow and external preset files', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')
    const presetPath = join(targetDir, 'gate-presets.json')

    try {
      await writeFile(
        workflowPath,
        JSON.stringify({
          name: 'duplicate-preset-workflow',
          version: '1.0.0',
          gatePresets: {
            'org:review': {
              type: 'manual',
              description: 'Workflow-owned review.'
            }
          },
          roles: {
            reviewer: {
              skills: ['code-review'],
              permissions: ['read_diff']
            }
          },
          stages: [
            {
              id: 'review',
              owner: 'reviewer',
              gates: [
                {
                  id: 'review_complete',
                  preset: 'org:review'
                }
              ]
            }
          ]
        })
      )
      await writeFile(
        presetPath,
        JSON.stringify({
          gatePresets: {
            'org:review': {
              type: 'manual',
              description: 'Organization-owned review.'
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
            presetPath,
            '--out',
            targetDir
          ]),
        /Duplicate gate preset "org:review"/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
