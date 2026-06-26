import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'

import { compileWorkflow } from '../src/compiler.js'

describe('generated web console runtime', () => {
  it('renders run filters and artifact links from safe run ids', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    const harness = createWebConsoleHarness({
      runs: [
        {
          id: 'safe-run',
          status: 'passed',
          runDir: '.tpan-opt-co-worker/runs/safe-run/../../outside',
          finishedAt: '2026-06-24T00:00:00.000Z'
        }
      ],
      details: {
        'safe-run': {
          commandGates: [],
          manualGates: []
        }
      }
    })

    vm.runInNewContext(extractConsoleScript(webConsole.content), harness.context)

    assert.match(harness.elements['run-history'].innerHTML, /\.\.\/runs\/safe-run\/evidence\.json/)
    assert.doesNotMatch(harness.elements['run-history'].innerHTML, /href="[^"]*outside/)

    harness.buttons.failed.click()
    assert.equal(harness.elements['run-history'].textContent, 'No runs match the selected status filter.')
    assert.equal(
      harness.elements['gate-details'].textContent,
      'No gate details match the selected status filter.'
    )

    harness.buttons.passed.click()
    assert.equal(
      harness.elements['gate-details'].textContent,
      'No gate details recorded for the selected runs.'
    )
  })

  it('renders orchestration stage state, work order, and invocations', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    const harness = createWebConsoleHarness(
      { runs: [], details: {} },
      {
        current: {
          status: 'blocked',
          runId: 'orch-1',
          currentStage: 'verify',
          stages: [{ id: 'verify', owner: 'lead', status: 'current' }],
          invocations: [{ stageId: 'verify', role: 'lead', status: 'completed', exitCode: 0 }],
          workOrder: {
            stageId: 'verify',
            owner: 'lead',
            pendingGates: [{ id: 'human_approval', type: 'manual' }],
            nextAction: 'Attach approval evidence for manual gate(s): human_approval.'
          }
        }
      }
    )

    vm.runInNewContext(extractConsoleScript(webConsole.content), harness.context)

    const html = harness.elements.orchestration.innerHTML
    assert.match(html, /orch-1/)
    assert.match(html, /Work Order · verify/)
    assert.match(html, /human_approval/)
    assert.match(html, /Agent Invocations/)
    assert.match(html, /Attach approval evidence/)
  })

  it('renders multiple parallel work orders across owners', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    const harness = createWebConsoleHarness(
      { runs: [], details: {} },
      {
        current: {
          status: 'blocked',
          runId: 'orch-2',
          currentStages: ['backend', 'frontend'],
          stages: [
            { id: 'backend', owner: 'backend', status: 'current' },
            { id: 'frontend', owner: 'frontend', status: 'current' }
          ],
          invocations: [],
          workOrders: [
            {
              stageId: 'backend',
              owner: 'backend',
              pendingGates: [{ id: 'backend_approved', type: 'manual' }],
              nextAction: 'Attach approval evidence for manual gate(s): backend_approved.'
            },
            {
              stageId: 'frontend',
              owner: 'frontend',
              pendingGates: [{ id: 'frontend_approved', type: 'manual' }],
              nextAction: 'Attach approval evidence for manual gate(s): frontend_approved.'
            }
          ]
        }
      }
    )

    vm.runInNewContext(extractConsoleScript(webConsole.content), harness.context)

    const html = harness.elements.orchestration.innerHTML
    assert.match(html, /current stages: backend, frontend/)
    assert.match(html, /Work Order · backend/)
    assert.match(html, /Work Order · frontend/)
  })

  it('marks an edited workflow draft valid in the designer', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    const harness = createWebConsoleHarness({ runs: [], details: {} }, { current: null })

    vm.runInNewContext(extractConsoleScript(webConsole.content), harness.context)

    const status = harness.elements['workflow-validation']
    assert.match(status.className, /valid/)
    assert.match(status.textContent, /Valid workflow draft/)
  })

  it('reports structural issues when an invalid draft is validated', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    const harness = createWebConsoleHarness({ runs: [], details: {} }, { current: null })

    vm.runInNewContext(extractConsoleScript(webConsole.content), harness.context)

    harness.elements['workflow-json'].value = JSON.stringify({
      name: 'edited',
      version: '1.0.0',
      roles: { lead: { skills: ['x'] } },
      stages: [
        { id: 'plan', owner: 'ghost' },
        { id: 'plan', owner: 'lead', dependsOn: ['later'] },
        { id: 'later', owner: 'lead' }
      ]
    })
    harness.elements['validate-workflow-json'].click()

    const status = harness.elements['workflow-validation']
    assert.match(status.className, /invalid/)
    assert.match(status.innerHTML, /unknown owner/)
    assert.match(status.innerHTML, /Duplicate stage id/)
    assert.match(status.innerHTML, /references unknown or later stage/)
  })

  it('flags an unparseable draft as invalid JSON', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    const harness = createWebConsoleHarness({ runs: [], details: {} }, { current: null })

    vm.runInNewContext(extractConsoleScript(webConsole.content), harness.context)

    harness.elements['workflow-json'].value = '{ not json'
    harness.elements['validate-workflow-json'].click()

    const status = harness.elements['workflow-validation']
    assert.match(status.className, /invalid/)
    assert.match(status.innerHTML, /Invalid JSON/)
  })

  it('emits empty orchestration placeholders for a clean first load', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const script = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/orchestration.js'
    )
    const data = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/orchestration.json'
    )

    assert.ok(script)
    assert.match(script.content, /window\.TPAN_OPT_ORCHESTRATION = /)
    assert.deepEqual(JSON.parse(data.content), { current: null })
  })

  it('emits empty run history placeholders for a clean first load', () => {
    const outputs = compileWorkflow(webConsoleWorkflow())
    const runsScript = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/runs.js'
    )
    const runsData = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/runs.json'
    )

    assert.ok(runsScript)
    assert.match(runsScript.content, /window\.TPAN_OPT_RUNS = /)
    assert.deepEqual(JSON.parse(runsData.content), { runs: [], details: {} })
    assert.deepEqual(
      JSON.parse(runsScript.content.replace('window.TPAN_OPT_RUNS = ', '')),
      { runs: [], details: {} }
    )
  })
})

function webConsoleWorkflow() {
  return {
    name: 'web-console-workflow',
    version: '1.0.0',
    roles: {
      lead: {
        skills: ['verification-loop'],
        permissions: ['read_repo']
      }
    },
    stages: [
      {
        id: 'verify',
        owner: 'lead',
        gates: [{ id: 'human_approval', type: 'manual' }]
      }
    ]
  }
}

function extractConsoleScript(content) {
  const match = content.match(/<script>\n([\s\S]*?)\n  <\/script>\n<\/body>/)
  assert.ok(match, 'expected generated console to include an inline runtime script')
  return match[1]
}

const MINIMAL_VALID_DRAFT = JSON.stringify(
  {
    name: 'draft',
    version: '1.0.0',
    roles: { lead: { skills: ['verification-loop'], permissions: ['read_repo'] } },
    stages: [{ id: 'plan', owner: 'lead', gates: [{ id: 'human_approval', type: 'manual' }] }]
  },
  null,
  2
)

function createWebConsoleHarness(runData, orchestrationData, designer = {}) {
  const draftValue = designer.value ?? MINIMAL_VALID_DRAFT
  const elements = {
    'run-summary': createElement(),
    'run-history': createElement(),
    'gate-details': createElement(),
    orchestration: createElement(),
    'workflow-json': createElement({ value: draftValue }),
    'workflow-validation': createElement(),
    'workflow-data': createElement({ textContent: designer.source ?? draftValue }),
    'copy-workflow-json': createElement(),
    'validate-workflow-json': createElement(),
    'download-workflow-json': createElement(),
    'reset-workflow-json': createElement()
  }
  const buttons = Object.fromEntries(
    ['all', 'passed', 'pending', 'failed'].map((status) => [
      status,
      createElement({
        attributes: {
          'data-status-filter': status
        }
      })
    ])
  )

  return {
    elements,
    buttons,
    context: {
      URL,
      navigator: {},
      window: {
        TPAN_OPT_RUNS: runData,
        TPAN_OPT_ORCHESTRATION: orchestrationData,
        isSecureContext: false,
        setTimeout: () => {}
      },
      document: {
        getElementById(id) {
          return elements[id] || null
        },
        querySelectorAll(selector) {
          return selector === '[data-status-filter]' ? Object.values(buttons) : []
        },
        execCommand() {
          return true
        }
      }
    }
  }
}

function createElement(options = {}) {
  const listeners = {}
  const element = {
    className: options.className || '',
    textContent: options.textContent || '',
    innerHTML: options.innerHTML || '',
    value: options.value || '',
    addEventListener(type, listener) {
      listeners[type] = listener
    },
    getAttribute(name) {
      return options.attributes?.[name] || null
    },
    click() {
      listeners.click?.()
    },
    focus() {},
    select() {}
  }
  element.classList = {
    toggle(className, force) {
      const classes = new Set(element.className.split(/\s+/).filter(Boolean))
      if (force) {
        classes.add(className)
      } else {
        classes.delete(className)
      }
      element.className = [...classes].join(' ')
    }
  }
  return element
}
