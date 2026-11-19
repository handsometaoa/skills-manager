import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { nameGitRootSkill } from '../../src/main/services/source-service'
import { SkillStore } from '../../src/main/services/skill-service'

test('Git root Skill keeps its declared name through import and OpenCode installation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'git-skill-test-'))
  try {
    const checkout = path.join(root, 'repo')
    await fs.mkdir(checkout)
    await fs.writeFile(
      path.join(checkout, 'SKILL.md'),
      '---\nname: code-review\ndescription: Review code\n---\n# Review',
    )
    await fs.writeFile(path.join(checkout, 'guide.txt'), 'supporting content')
    const named = await nameGitRootSkill(checkout)
    assert.equal(path.basename(named), 'code-review')
    const store = new SkillStore(path.join(root, 'data'), path.join(root, 'home'))
    await store.init()
    const candidates = await store.discover(named)
    assert.equal(candidates[0].name, 'code-review')
    assert.deepEqual(candidates[0].warnings, [])
    await store.addToLibrary(
      [{ path: named, source: 'https://example.com/team/repository.git#' }],
      'all',
    )
    const skill = (await store.scan()).library[0]
    await store.installLibrary([skill.id], ['opencode'])
    assert.equal((await store.scan()).skills[0].name, 'code-review')
    assert.equal(
      await fs.readFile(path.join(skill.path, 'guide.txt'), 'utf8'),
      'supporting content',
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('Git collection directories keep their nested Skill names', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'git-skills-test-'))
  try {
    const checkout = path.join(root, 'skills')
    await fs.mkdir(path.join(checkout, 'review'), { recursive: true })
    await fs.writeFile(
      path.join(checkout, 'review', 'SKILL.md'),
      '---\nname: review\ndescription: Review\n---\n',
    )
    assert.equal(await nameGitRootSkill(checkout), checkout)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
