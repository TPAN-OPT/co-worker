import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

describe('README roadmap', () => {
  it('has no remaining unchecked roadmap items in either language', async () => {
    const [englishReadme, chineseReadme] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('README.zh-CN.md', 'utf8')
    ])

    assert.equal(englishReadme.includes('- [ ]'), false)
    assert.equal(chineseReadme.includes('- [ ]'), false)
  })
})
