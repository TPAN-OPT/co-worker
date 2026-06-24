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

function createWebConsoleHarness(runData) {
  const elements = {
    'run-summary': createElement(),
    'run-history': createElement(),
    'gate-details': createElement()
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
