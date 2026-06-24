import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

export async function writeCompiledOutputs(outputs, targetDir, options = {}) {
  const force = options.force === true
  const dryRun = options.dryRun === true
  const targetRoot = resolve(targetDir)
  const safeOutputs = outputs.map((output) => normalizeOutput(output, targetRoot))

  if (dryRun) {
    return {
      written: [],
      planned: safeOutputs.map((output) => output.path)
    }
  }

  await assertNoOverwriteConflicts(safeOutputs, force)

  for (const output of safeOutputs) {
    await mkdir(dirname(output.absolutePath), { recursive: true })
    await writeFile(output.absolutePath, output.content, 'utf8')
  }

  return {
    written: safeOutputs.map((output) => output.path),
    planned: safeOutputs.map((output) => output.path)
  }
}

function normalizeOutput(output, targetRoot) {
  if (!output || typeof output.path !== 'string' || typeof output.content !== 'string') {
    throw new Error('Compiled output must include path and content strings')
  }

  const absolutePath = resolve(targetRoot, output.path)
  const isInsideTarget =
    absolutePath === targetRoot || absolutePath.startsWith(`${targetRoot}${sep}`)

  if (!isInsideTarget) {
    throw new Error(`Unsafe output path "${output.path}"`)
  }

  return {
    path: output.path,
    content: output.content,
    absolutePath
  }
}

async function assertNoOverwriteConflicts(outputs, force) {
  if (force) {
    return
  }

  for (const output of outputs) {
    if (await fileExists(output.absolutePath)) {
      throw new Error(
        `Refusing to overwrite existing file "${output.path}". Re-run with --force to replace it.`
      )
    }
  }
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}
