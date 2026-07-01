import { readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { validateWorkflow } from './compiler.js'
import { writeCompiledOutputs } from './file-system.js'
import { renderDemoAgentScript } from './demo-agent-template.js'
import { knownAgentIds, realAgentCommand } from './agent-detect.js'

// The quickstart demo layer: everything that turns a freshly compiled repo into
// a populated console — driving the bundled offline demo agent (or a real agent
// CLI) through the orchestrator, then printing the honest next steps. Extracted
// from init-commands.js so that file stays under the repository line cap.

// Decide whether this quickstart should drive a real agent CLI instead of the
// bundled offline demo. Only opts in when the user passed --real: with --agent
// we honor that choice if it is installed, otherwise fall back to the first
// detected agent, otherwise report that none was found so the caller can run the
// offline demo and say so honestly.
export function resolveRealAgentPlan(options, detectedAgents) {
  if (!options.real) {
    return { real: false }
  }

  if (options.agent) {
    if (detectedAgents.includes(options.agent)) {
      return { real: true, agentId: options.agent, agentCommand: realAgentCommand(options.agent) }
    }
    return { real: false, requestedButMissing: true, requestedAgent: options.agent }
  }

  const chosen = detectedAgents[0]
  if (chosen) {
    return { real: true, agentId: chosen, agentCommand: realAgentCommand(chosen) }
  }
  return { real: false, requestedButMissing: true, requestedAgent: '' }
}

// The quickstart workflow's stages gate on a bundled offline demo agent so a
// fresh repo can run the whole team end to end with no agent CLI or network.
// Written for every quickstart (even --no-demo) so orchestration.agentCommand runs.
export async function writeDemoAgent(targetDir) {
  await writeCompiledOutputs(
    [{ path: 'scripts/demo-agent.mjs', content: renderDemoAgentScript() }],
    targetDir,
    { force: true }
  )
}

// Seed the console with a demo run. The opt-demo template persists an agent
// command, so it drives every owner agent end to end; templates without one
// (minimal, production-feature) fall back to the lighter manual-seed demo.
export async function runQuickstartDemo(workflow, targetDir, options, realPlan) {
  const normalized = validateWorkflow(workflow)

  // --real: drive an installed agent CLI so the run produces real work at the
  // swap-seam artifact path (the same gates cascade). Use its own run id so the
  // real run does not collide with a later offline demo on "local".
  if (realPlan.real) {
    const runId = options.runIdSpecified ? options.runId : 'real'
    return runInvokeDemo(normalized, targetDir, runId, {
      agentCommand: realPlan.agentCommand,
      agentId: realPlan.agentId
    })
  }

  if (realPlan.requestedButMissing) {
    const want = realPlan.requestedAgent ? `"${realPlan.requestedAgent}"` : 'a supported agent CLI'
    console.log(
      `--real requested but ${want} was not found on PATH (looked for ${knownAgentIds().join(', ')}). Running the offline demo instead.`
    )
  }

  if (workflow.orchestration && workflow.orchestration.agentCommand) {
    return runInvokeDemo(normalized, targetDir, options.runId)
  }
  return runManualSeedDemo(normalized, targetDir, options.runId)
}

// Drive a real orchestration run with --invoke so the bundled demo agent does
// each stage's work and the console shows a populated, multi-role run. The owner
// agent is invoked for clarify -> implement -> review -> ship; each writes its
// artifact, turning the stage's command gate green, so the run cascades and
// stops at the single human-approval gate. Exit code 1 just means that human
// gate is (correctly) still open, so only a spawn error downgrades to a skip.
// The run id matches `approve`'s default ("local") so finishing is one command.
async function runInvokeDemo(normalized, targetDir, runId, real = null) {
  const finalStage = normalized.stages[normalized.stages.length - 1]
  const manualGate = (finalStage.gates || []).find((gate) => gate.type === 'manual')
  const scriptPath = resolve(targetDir, 'scripts', 'orchestrate-workflow.mjs')
  const usingReal = Boolean(real && real.agentCommand)
  const invokeArgs = [scriptPath, '--run-id', runId, '--invoke']
  if (usingReal) {
    // Override the persisted demo command with the detected agent so its output
    // lands at the stable artifact path and the same gates go green on real work.
    invokeArgs.push('--agent-command', real.agentCommand)
  }
  const result = spawnSync(process.execPath, invokeArgs, { cwd: targetDir, encoding: 'utf8' })

  if (result.error) {
    const rerun = usingReal
      ? `node scripts/orchestrate-workflow.mjs --run-id ${runId} --invoke --agent-command '${real.agentCommand}'`
      : `node scripts/orchestrate-workflow.mjs --run-id ${runId} --invoke`
    console.log(`Skipped ${usingReal ? 'real-agent' : 'demo'} orchestration (${result.error.message}). Run it yourself: ${rerun}`)
    return { ran: false, runId }
  }

  // Trust the orchestration state, not the exit code: only claim the agents drove
  // the run to the approval gate if every non-manual gate actually passed. A real
  // agent that produced nothing leaves command gates red, so we report honestly
  // where it stalled instead of pretending real work happened.
  const stalledStage = firstUnfinishedStage(targetDir, runId)
  if (stalledStage) {
    return { ran: true, drove: false, stalled: true, real: usingReal, agentId: usingReal ? real.agentId : '', runId, stalledStage }
  }

  return {
    ran: true,
    drove: true,
    real: usingReal,
    agentId: usingReal ? real.agentId : '',
    runId,
    approveStage: finalStage.id,
    approveGate: manualGate ? manualGate.id : ''
  }
}

// Read the persisted run state and return the id of the first stage still holding
// a non-manual gate open (i.e. the agents did not finish it), or '' when every
// command gate passed and only human approval remains. Missing/unreadable state
// counts as unfinished so we never overclaim success.
function firstUnfinishedStage(targetDir, runId) {
  const statePath = resolve(targetDir, '.tpan-opt-co-worker', 'orchestrations', runId, 'state.json')
  let state
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return 'unknown'
  }
  for (const stage of state.stages || []) {
    const commandGatesOpen = (stage.gates || []).some(
      (gate) => gate.type !== 'manual' && gate.status !== 'passed'
    )
    if (commandGatesOpen) {
      return stage.id
    }
  }
  return ''
}

// Fallback demo for templates that do not persist an agent command: pre-approve
// the first stage's manual gates and run the orchestrator (no --invoke) so the
// console shows the first stage done and the next as an open work order.
async function runManualSeedDemo(normalized, targetDir, runId) {
  const firstStage = normalized.stages[0]
  const gates = {}
  for (const gate of firstStage.gates) {
    if (gate.type === 'manual') {
      gates[`${firstStage.id}.${gate.id}`] = {
        approvedBy: 'demo@tpan-opt-co-worker.local',
        note: 'Seeded by quickstart demo.'
      }
    }
  }

  const evidenceRelativePath = '.tpan-opt-co-worker/demo/manual-evidence.json'
  await writeCompiledOutputs(
    [{ path: evidenceRelativePath, content: `${JSON.stringify({ gates }, null, 2)}\n` }],
    targetDir,
    { force: true }
  )

  const scriptPath = resolve(targetDir, 'scripts', 'orchestrate-workflow.mjs')
  const evidencePath = resolve(targetDir, evidenceRelativePath)
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--run-id', runId, '--manual-evidence', evidencePath],
    { cwd: targetDir, encoding: 'utf8' }
  )

  if (result.error) {
    console.log(
      `Skipped demo orchestration (${result.error.message}). Run it yourself: node scripts/orchestrate-workflow.mjs --run-id ${runId}`
    )
    return { ran: false, runId }
  }

  return { ran: true, drove: false, runId }
}

export function printQuickstartNextSteps(targetDir, demo, open, detectedAgents = []) {
  const consolePath = resolve(targetDir, '.tpan-opt-co-worker', 'console', 'index.html')
  const real = Boolean(demo && demo.real)
  const artifactsPath = resolve(
    targetDir,
    '.tpan-opt-co-worker',
    ...(real ? ['artifacts'] : ['demo', 'artifacts'])
  )

  console.log('')
  console.log('Quickstart ready.')
  if (demo && demo.ran && demo.drove && real) {
    console.log(
      `Your ${demo.agentId} agent team just ran end to end: planner -> engineer -> reviewer -> lead each did their stage and produced REAL work (run "${demo.runId}").`
    )
    console.log(`See what they wrote: ${artifactsPath}`)
  } else if (demo && demo.ran && demo.drove) {
    console.log(
      `Your agent team just ran end to end: planner -> engineer -> reviewer -> lead each did their stage and produced an artifact (run "${demo.runId}").`
    )
    console.log(`See what they wrote: ${artifactsPath}`)
    console.log('Note: this was the bundled OFFLINE demo agent — placeholder artifacts, not real work.')
  } else if (demo && demo.ran && demo.stalled) {
    const who = demo.agentId ? `The ${demo.agentId} agent run` : 'The run'
    const where = demo.stalledStage && demo.stalledStage !== 'unknown' ? ` at stage "${demo.stalledStage}"` : ''
    console.log(`${who} did not complete every stage${where} — its command gate is still open (no artifact with real content yet).`)
    console.log('Open the console to see where it stopped, then fix and re-run:')
    console.log('  tpan-opt-co-worker quickstart --real --force')
  } else if (demo && demo.ran) {
    console.log(`Seeded a demo orchestration run "${demo.runId}" so the console shows live stage progress.`)
  }

  const opened = open ? openInBrowser(consolePath) : false
  console.log('')
  if (opened) {
    console.log(`Opened the console: ${consolePath}`)
  } else {
    console.log(`Open the console in a browser: ${consolePath}`)
  }

  console.log('')
  if (demo && demo.ran && demo.approveGate) {
    const stageFlag = demo.approveStage ? ` --stage ${demo.approveStage}` : ''
    const runFlag = demo.runId && demo.runId !== 'local' ? ` --run-id ${demo.runId}` : ''
    console.log('Everything the agents could do is done — one human approval is left. Approve to finish:')
    console.log(`  tpan-opt-co-worker approve ${demo.approveGate}${stageFlag} --by you${runFlag}`)
  } else if (!(demo && demo.stalled)) {
    console.log('Drive the workflow yourself: node scripts/orchestrate-workflow.mjs --run-id local --invoke')
  }

  console.log('')
  if (demo && demo.stalled) {
    // The stalled message above already told them how to re-run; don't repeat.
  } else if (real) {
    // Already ran for real; just point at how to iterate.
    console.log('That was a real agent run. Re-run any time with: tpan-opt-co-worker quickstart --real --force')
  } else if (detectedAgents.length > 0) {
    // The honest, low-friction upgrade: an agent is installed, so one flag turns
    // the demo into a real run instead of asking the user to hand-write a command.
    console.log(`Detected ${detectedAgents.join(', ')} on your PATH. Run the same flow for REAL with one flag:`)
    console.log(`  tpan-opt-co-worker quickstart --real --force${detectedAgents.length > 1 ? ` --agent ${detectedAgents[0]}` : ''}`)
    console.log('  (writes each stage to .tpan-opt-co-worker/artifacts/{stage}.md; the same gates cascade.)')
  } else {
    console.log('Run the same flow with a REAL agent: install claude, codex, or cursor-agent, then:')
    console.log('  tpan-opt-co-worker quickstart --real --force')
    console.log('  (or drive it yourself: node scripts/orchestrate-workflow.mjs --run-id real --invoke --loop \\')
    console.log("     --agent-command 'claude -p \"You are the {role}. Do stage {stage} from brief {brief}. Write your result to .tpan-opt-co-worker/artifacts/{stage}.md\"')")
  }

  console.log('')
  console.log('Then make it yours: edit opt.workflow.json (or the console Designer) and re-apply:')
  console.log('  tpan-opt-co-worker compile --workflow opt.workflow.json --out . --force')
}

// Best-effort: open the generated console in the default browser, but only when
// running interactively (a TTY, not CI). In tests and automation stdout is not a
// TTY, so this stays a no-op and we just print the path. Never throws.
function openInBrowser(targetPath) {
  if (!process.stdout.isTTY || process.env.CI) {
    return false
  }

  const opener =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open'
  const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', targetPath] : [targetPath]

  try {
    const child = spawn(opener, openerArgs, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}
