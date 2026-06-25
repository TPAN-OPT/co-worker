import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  renderOrganizationInline,
  renderOrganizationMarkdown
} from '../src/organization-renderer.js'

describe('organization renderer', () => {
  it('omits organization sections when no metadata is provided', () => {
    assert.equal(renderOrganizationMarkdown(undefined), '')
    assert.equal(renderOrganizationInline(undefined), '')
  })

  it('renders team and empty policy fallbacks', () => {
    const organization = {
      team: 'platform'
    }

    assert.match(renderOrganizationMarkdown(organization), /Team: `platform`/)
    assert.match(renderOrganizationMarkdown(organization), /Policies: none/)
    assert.equal(
      renderOrganizationInline(organization),
      ' Organization standards: Team: platform. Policies: none.'
    )
  })

  it('renders known policies with de-duplicated inline rules', () => {
    const organization = {
      policies: ['quality-standard', 'security-baseline', 'quality-standard']
    }
    const inline = renderOrganizationInline(organization)
    const markdown = renderOrganizationMarkdown(organization)

    assert.match(inline, /Team: none/)
    assert.match(inline, /Policies: quality-standard, security-baseline, quality-standard/)
    assert.equal((inline.match(/tests_first/g) || []).length, 1)
    assert.match(markdown, /Quality Standard/)
    assert.match(markdown, /Security Baseline/)
    assert.match(markdown, /`no_hardcoded_secrets`/)
  })

  it('keeps unknown policy ids visible while omitting unknown rules', () => {
    const organization = {
      team: 'platform',
      policies: ['unknown-policy']
    }

    assert.match(renderOrganizationMarkdown(organization), /Policies: `unknown-policy`/)
    assert.doesNotMatch(renderOrganizationMarkdown(organization), /Policy Pack Rules/)
    assert.equal(
      renderOrganizationInline(organization),
      ' Organization standards: Team: platform. Policies: unknown-policy.'
    )
  })
})
