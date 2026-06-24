import { constants } from 'node:fs'
import { access, lstat, mkdir, open, realpath } from 'node:fs/promises'
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
  await mkdir(targetRoot, { recursive: true })
  const targetRealRoot = await realpath(targetRoot)

  for (const output of safeOutputs) {
    await assertNoSymlinkInOutputPath(output, targetRoot)
    await mkdir(dirname(output.absolutePath), { recursive: true })
    await assertNoSymlinkInOutputPath(output, targetRoot)
    await assertParentInsideTarget(output, targetRealRoot)
    await writeFileNoFollow(output.absolutePath, output.content)
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

async function assertParentInsideTarget(output, targetRealRoot) {
  const parentRealPath = await realpath(dirname(output.absolutePath))
  const isInsideTarget =
    parentRealPath === targetRealRoot || parentRealPath.startsWith(`${targetRealRoot}${sep}`)

  if (!isInsideTarget) {
    throw new Error(`Unsafe output path "${output.path}" resolves outside the target directory`)
  }
}

async function assertNoSymlinkInOutputPath(output, targetRoot) {
  const segments = output.absolutePath
    .slice(targetRoot.length)
    .split(sep)
    .filter(Boolean)
  let currentPath = targetRoot

  for (const segment of segments) {
    currentPath = resolve(currentPath, segment)
    const stats = await lstatIfExists(currentPath)

    if (stats?.isSymbolicLink()) {
      throw new Error(`Unsafe output path "${output.path}" resolves through a symbolic link`)
    }
  }
}

async function writeFileNoFollow(path, content) {
  const noFollow = constants.O_NOFOLLOW || 0
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow
  const file = await open(path, flags, 0o666)

  try {
    await file.writeFile(content, 'utf8')
  } finally {
    await file.close()
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

async function lstatIfExists(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}
