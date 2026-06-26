// Inline runtime for the generated console's Workflow Designer panel. Returned
// as a string and interpolated into the console's main <script>, so it shares
// scope (escapeHtml, document, window) with the rest of the runtime. Kept here
// to keep web-console-renderer.js under the repository file-size limit.
//
// The panel makes the workflow definition editable in the browser: it validates
// a draft against the same structural invariants the compiler enforces and lets
// the operator copy or download the edited JSON. There is no server, so the CLI
// `compile` step remains the authoritative validator that writes assets.
export function renderDesignerRuntime() {
  return `    function designerIdentifier() {
      return /^[A-Za-z][A-Za-z0-9_-]*$/
    }

    function initWorkflowDesigner() {
      const textarea = document.getElementById('workflow-json')
      if (!textarea) return
      bindDesignerButton('copy-workflow-json', copyWorkflowJson)
      bindDesignerButton('validate-workflow-json', () => runWorkflowValidation(true))
      bindDesignerButton('download-workflow-json', downloadWorkflowJson)
      bindDesignerButton('reset-workflow-json', resetWorkflowJson)
      textarea.addEventListener('input', () => runWorkflowValidation(false))
      runWorkflowValidation(false)
    }

    function bindDesignerButton(id, handler) {
      const button = document.getElementById(id)
      if (button) button.addEventListener('click', handler)
    }

    function runWorkflowValidation(focusOnError) {
      const textarea = document.getElementById('workflow-json')
      const status = document.getElementById('workflow-validation')
      if (!textarea || !status) return { ok: false, errors: [] }
      const result = validateWorkflowDraft(textarea.value)
      renderDesignerStatus(status, result)
      if (focusOnError && !result.ok) textarea.focus()
      return result
    }

    function renderDesignerStatus(status, result) {
      if (result.ok) {
        status.className = 'designer-status valid'
        status.textContent = 'Valid workflow draft. Copy or download it, then run the compile command to apply it.'
        return
      }
      const count = result.errors.length
      status.className = 'designer-status invalid'
      status.innerHTML =
        '<strong>' + escapeHtml(count) + ' issue' + (count === 1 ? '' : 's') + ' to fix</strong>' +
        '<ul>' + result.errors.map((error) => '<li>' + escapeHtml(error) + '</li>').join('') + '</ul>'
    }

    function validateWorkflowDraft(text) {
      let workflow
      try {
        workflow = JSON.parse(text)
      } catch (error) {
        return { ok: false, errors: ['Invalid JSON: ' + ((error && error.message) || 'could not parse the draft') ] }
      }

      if (!isDesignerObject(workflow)) {
        return { ok: false, errors: ['Workflow must be a JSON object.'] }
      }

      const workflowFields = ['name', 'version', 'organization', 'gatePresets', 'roles', 'stages', 'orchestration']
      const errors = []
      for (const field of Object.keys(workflow)) {
        if (!workflowFields.includes(field)) errors.push('Unknown workflow field "' + field + '".')
      }
      if (!isDesignerString(workflow.name)) errors.push('Workflow "name" must be a non-empty string.')
      if (!isDesignerString(workflow.version)) errors.push('Workflow "version" must be a non-empty string.')

      const roleIds = validateDesignerRoles(workflow.roles, errors)
      validateDesignerStages(workflow.stages, roleIds, errors)

      return { ok: errors.length === 0, errors }
    }

    function validateDesignerRoles(roles, errors) {
      const roleIds = []
      if (!isDesignerObject(roles) || Object.keys(roles).length === 0) {
        errors.push('Workflow "roles" must be a non-empty object.')
        return roleIds
      }
      for (const roleId of Object.keys(roles)) {
        if (!designerIdentifier().test(roleId)) {
          errors.push('Role id "' + roleId + '" must use letters, numbers, underscores, or hyphens.')
        } else {
          roleIds.push(roleId)
        }
        const role = roles[roleId]
        if (!isDesignerObject(role)) {
          errors.push('Role "' + roleId + '" must be an object.')
          continue
        }
        checkDesignerStringArray(role.skills, 'Role "' + roleId + '" skills', errors)
        checkDesignerStringArray(role.permissions, 'Role "' + roleId + '" permissions', errors)
      }
      return roleIds
    }

    function validateDesignerStages(stages, roleIds, errors) {
      if (!Array.isArray(stages) || stages.length === 0) {
        errors.push('Workflow "stages" must be a non-empty array.')
        return
      }
      const stageFields = ['id', 'owner', 'output', 'required', 'dependsOn', 'gates']
      const seenStages = []
      stages.forEach((stage, index) => {
        const label = 'Stage ' + (index + 1)
        if (!isDesignerObject(stage)) {
          errors.push(label + ' must be an object.')
          return
        }
        for (const field of Object.keys(stage)) {
          if (!stageFields.includes(field)) errors.push(label + ' contains unknown field "' + field + '".')
        }

        const id = stage.id
        const stageName = isDesignerString(id) ? id : label
        if (!isDesignerString(id)) {
          errors.push(label + ' "id" must be a non-empty string.')
        } else {
          if (!designerIdentifier().test(id)) errors.push('Stage id "' + id + '" must use letters, numbers, underscores, or hyphens.')
          if (seenStages.includes(id)) errors.push('Duplicate stage id "' + id + '".')
        }

        if (!isDesignerString(stage.owner)) {
          errors.push(label + ' "owner" must be a non-empty string.')
        } else if (roleIds.length > 0 && !roleIds.includes(stage.owner)) {
          errors.push('Stage "' + stageName + '" references unknown owner "' + stage.owner + '".')
        }

        validateDesignerDependencies(stage.dependsOn, stageName, id, seenStages, errors)
        checkDesignerStringArray(stage.required, label + ' required', errors)
        validateDesignerGates(stage.gates, label, errors)

        if (isDesignerString(id)) seenStages.push(id)
      })
    }

    function validateDesignerDependencies(dependsOn, stageName, id, seenStages, errors) {
      if (dependsOn === undefined) return
      if (!Array.isArray(dependsOn)) {
        errors.push('Stage "' + stageName + '" dependsOn must be an array.')
        return
      }
      const seenDeps = []
      for (const dep of dependsOn) {
        if (!isDesignerString(dep)) {
          errors.push('Stage "' + stageName + '" dependsOn entries must be non-empty strings.')
          continue
        }
        if (dep === id) {
          errors.push('Stage "' + id + '" cannot depend on itself.')
        } else if (!seenStages.includes(dep)) {
          errors.push('Stage "' + stageName + '" dependsOn references unknown or later stage "' + dep + '".')
        }
        if (seenDeps.includes(dep)) errors.push('Stage "' + stageName + '" dependsOn lists "' + dep + '" more than once.')
        seenDeps.push(dep)
      }
    }

    function validateDesignerGates(gates, label, errors) {
      if (gates === undefined) return
      if (!Array.isArray(gates)) {
        errors.push(label + ' gates must be an array.')
        return
      }
      const seenGates = []
      gates.forEach((gate, index) => {
        const gateId = checkDesignerGate(gate, label + ' gate ' + (index + 1), errors)
        if (!gateId) return
        if (seenGates.includes(gateId)) errors.push('Duplicate gate id "' + gateId + '".')
        seenGates.push(gateId)
      })
    }

    function checkDesignerGate(gate, label, errors) {
      if (typeof gate === 'string') {
        if (!isDesignerString(gate)) {
          errors.push(label + ' must be a non-empty string.')
          return ''
        }
        if (!designerIdentifier().test(gate)) errors.push('Gate "' + gate + '" must use letters, numbers, underscores, or hyphens.')
        return gate
      }
      if (!isDesignerObject(gate)) {
        errors.push(label + ' must be a gate id string or a gate object.')
        return ''
      }
      const gateFields = ['id', 'type', 'preset', 'description', 'command']
      for (const field of Object.keys(gate)) {
        if (!gateFields.includes(field)) errors.push(label + ' contains unknown field "' + field + '".')
      }
      const id = gate.id
      if (!isDesignerString(id)) {
        errors.push(label + ' "id" must be a non-empty string.')
        return ''
      }
      if (!designerIdentifier().test(id)) errors.push('Gate "' + id + '" must use letters, numbers, underscores, or hyphens.')
      const type = isDesignerString(gate.type) ? gate.type.trim() : ''
      if (type && type !== 'manual' && type !== 'command') errors.push('Gate "' + id + '" type must be "manual" or "command".')
      if (type === 'command' && !isDesignerString(gate.command) && !isDesignerString(gate.preset)) {
        errors.push('Gate "' + id + '" is a command gate but has no command or preset.')
      }
      return id
    }

    function checkDesignerStringArray(value, label, errors) {
      if (value === undefined) return
      if (!Array.isArray(value)) {
        errors.push(label + ' must be an array.')
        return
      }
      value.forEach((item, index) => {
        if (!isDesignerString(item)) errors.push(label + '[' + index + '] must be a non-empty string.')
      })
    }

    function isDesignerObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    }

    function isDesignerString(value) {
      return typeof value === 'string' && value.trim() !== ''
    }

    async function copyWorkflowJson() {
      const textarea = document.getElementById('workflow-json')
      const copyButton = document.getElementById('copy-workflow-json')
      if (!textarea || !copyButton) return
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(textarea.value)
        } else {
          textarea.focus()
          textarea.select()
          document.execCommand('copy')
        }
        flashDesignerButton(copyButton, 'Copied', 'Copy JSON')
      } catch {
        flashDesignerButton(copyButton, 'Copy failed', 'Copy JSON')
      }
    }

    function flashDesignerButton(button, message, original) {
      button.textContent = message
      window.setTimeout(() => {
        button.textContent = original
      }, 1600)
    }

    function downloadWorkflowJson() {
      const textarea = document.getElementById('workflow-json')
      if (!textarea) return
      const blob = new Blob([textarea.value], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'opt.workflow.json'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }

    function resetWorkflowJson() {
      const textarea = document.getElementById('workflow-json')
      const source = document.getElementById('workflow-data')
      if (!textarea || !source) return
      try {
        textarea.value = JSON.stringify(JSON.parse(source.textContent || '{}'), null, 2)
      } catch {
        return
      }
      runWorkflowValidation(false)
    }`
}
