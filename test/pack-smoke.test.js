import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packSmokeScriptPath = resolve('scripts/pack-smoke.mjs')

describe('pack-smoke script', () => {
  it('passes when the package dry run includes required release files', async () => {
    const targetDir = await createPackageFixture()

    try {
      const { stdout } = await execFileAsync('node', [packSmokeScriptPath], {
        cwd: targetDir
      })

      assert.match(stdout, /Package smoke contains/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('fails when required release files are missing from the package', async () => {
    const targetDir = await createPackageFixture({
      includeChineseReadme: false
    })

    try {
      await assert.rejects(
        () =>
          execFileAsync('node', [packSmokeScriptPath], {
            cwd: targetDir
          }),
        /README\.zh-CN\.md/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('fails when npm pack returns invalid JSON output', async () => {
    const targetDir = await createPackageFixture()
    const binDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-fake-npm-'))

    try {
      await writeExecutable(
        join(binDir, 'npm'),
        '#!/usr/bin/env node\nprocess.stdout.write("not json")\n'
      )

      await assert.rejects(
        () =>
          execFileAsync('node', [packSmokeScriptPath], {
            cwd: targetDir,
            env: {
              ...process.env,
              PATH: `${binDir}${delimiter}${process.env.PATH}`
            }
          }),
        /Unable to parse npm pack output/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
      await rm(binDir, { recursive: true, force: true })
    }
  })

  it('propagates npm pack failures', async () => {
    const targetDir = await createPackageFixture()
    const binDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-fake-npm-'))

    try {
      await writeExecutable(
        join(binDir, 'npm'),
        '#!/usr/bin/env node\nprocess.stderr.write("pack failed\\n")\nprocess.exit(42)\n'
      )

      await assert.rejects(
        () =>
          execFileAsync('node', [packSmokeScriptPath], {
            cwd: targetDir,
            env: {
              ...process.env,
              PATH: `${binDir}${delimiter}${process.env.PATH}`
            }
          }),
        (error) => {
          assert.equal(error.code, 42)
          assert.match(error.stderr, /pack failed/)
          return true
        }
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
      await rm(binDir, { recursive: true, force: true })
    }
  })

  it('installs the packaged CLI and runs core commands from the binary', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-package-e2e-'))
    const installDir = join(targetDir, 'install')
    const projectDir = join(targetDir, 'project')

    // Isolate the npm cache to this run. node --test executes test files in
    // parallel, so sharing the user's ~/.npm cache across concurrent pack/install
    // operations races cacache and surfaces as "tarball data ... seems to be
    // corrupted" followed by ENOENT. A per-run cache makes this test hermetic.
    const cacheDir = join(targetDir, 'npm-cache')

    try {
      await mkdir(installDir)
      await mkdir(projectDir)
      await mkdir(cacheDir)
      const packResult = await execFileAsync(
        'npm',
        ['pack', '--json', '--pack-destination', targetDir, '--cache', cacheDir],
        { cwd: resolve('.') }
      )
      const [packedPackage] = JSON.parse(packResult.stdout)
      const tarballPath = join(targetDir, packedPackage.filename)

      await execFileAsync('npm', ['install', tarballPath, '--ignore-scripts', '--cache', cacheDir], {
        cwd: installDir
      })

      const binaryPath = join(installDir, 'node_modules', '.bin', 'tpan-opt-co-worker')
      const help = await execFileAsync(binaryPath, ['--help'], { cwd: installDir })
      assert.match(help.stdout, new RegExp('TPAN' + '-OPT/CO-WORKER'))

      await execFileAsync(
        binaryPath,
        ['init', '--out', projectDir, '--name', 'packaged-workflow'],
        { cwd: installDir }
      )
      await execFileAsync(
        binaryPath,
        ['validate', '--workflow', join(projectDir, 'opt.workflow.json')],
        { cwd: installDir }
      )
      const compile = await execFileAsync(
        binaryPath,
        ['compile', '--workflow', join(projectDir, 'opt.workflow.json'), '--out', projectDir],
        { cwd: installDir }
      )

      assert.match(compile.stdout, /Wrote .* files/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})

async function createPackageFixture(options = {}) {
  const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-pack-'))
  const includeChineseReadme = options.includeChineseReadme !== false

  await mkdir(join(targetDir, 'examples'), { recursive: true })
  await mkdir(join(targetDir, 'scripts'), { recursive: true })
  await mkdir(join(targetDir, 'src'), { recursive: true })
  await mkdir(join(targetDir, 'test'), { recursive: true })
  await writeFile(join(targetDir, 'LICENSE'), 'MIT\n')
  await writeFile(join(targetDir, 'README.md'), '# Package Fixture\n')
  await writeFile(join(targetDir, 'examples', 'opt.workflow.json'), '{}\n')
  await writeFile(join(targetDir, 'scripts', 'check-coverage.mjs'), '#!/usr/bin/env node\n')
  await writeFile(join(targetDir, 'scripts', 'verify.mjs'), '#!/usr/bin/env node\n')
  await writeFile(join(targetDir, 'src', 'cli.js'), '#!/usr/bin/env node\n')
  await writeFile(join(targetDir, 'test', 'cli.test.js'), 'import "node:test"\n')
  await writeFile(
    join(targetDir, 'package.json'),
    JSON.stringify(
      {
        name: 'pack-fixture',
        version: '1.0.0',
        files: [
          'src',
          'scripts',
          'test',
          'examples',
          'README.md',
          'README.zh-CN.md',
          'LICENSE'
        ]
      },
      null,
      2
    )
  )

  if (includeChineseReadme) {
    await writeFile(join(targetDir, 'README.zh-CN.md'), '# Package Fixture\n')
  }

  return targetDir
}

async function writeExecutable(path, content) {
  await writeFile(path, content)
  await chmod(path, 0o755)
}
