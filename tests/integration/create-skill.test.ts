import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { SkillStore } from '../../src/main/services/skill-service'
import { inspectSkill } from '../../src/main/services/skill-parser'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-create-'))
  const store = new SkillStore(path.join(root, 'data'), path.join(root, 'home'))
  await store.init()
  return { root, store, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}

test('created library template becomes a managed skill with parseable metadata', async () => {
  const f = await fixture()
  try {
    const candidate = await f.store.createSkill({
      name: 'code-review',
      description: '检查代码变更：正确性、回归风险与测试覆盖。\n第二行描述也必须可解析。',
      target: 'library',
      compatibility: ['claude'],
    })
    const library = (await f.store.scan()).library
    assert.equal(library.length, 1)
    assert.equal(library[0].name, 'code-review')
    assert.deepEqual(library[0].compatibility, ['claude'])
    // The scaffold must pass the same metadata checks as imported skills.
    const inspected = await inspectSkill(candidate.path)
    assert.equal(inspected.metadataName, 'code-review')
    assert.ok(inspected.description.includes('第二行描述也必须可解析'))
    await f.store.readFile(library[0].id, 'SKILL.md')
    // Same name with a different scope is allowed; same scope is rejected.
    await f.store.createSkill({
      name: 'code-review',
      description: '另一个适用范围的同名模板',
      target: 'library',
      compatibility: ['zcode'],
    })
    await assert.rejects(
      () =>
        f.store.createSkill({
          name: 'code-review',
          description: '重复',
          target: 'library',
          compatibility: ['claude'],
        }),
      /同名、同适用范围/,
    )
    assert.equal((await f.store.scan()).library.length, 2)
  } finally {
    await f.cleanup()
  }
})

test('created tool template is discovered in place and enforces tool rules', async () => {
  const f = await fixture()
  try {
    const claudeRoot = f.store.tools.find((t) => t.id === 'claude')!.root
    await f.store.createSkill({
      name: 'release-notes',
      description: '从提交记录整理版本变更。',
      target: 'claude',
    })
    const skills = (await f.store.scan()).skills
    const created = skills.find((s) => s.name === 'release-notes')!
    assert.ok(created)
    assert.equal(created.managed, false)
    assert.ok(created.path.startsWith(claudeRoot))
    // Cursor and OpenCode read the Claude directory by default, so the skill
    // is discovered there too; Claude itself must always be among the readers.
    assert.ok(created.discoveredBy?.includes('claude'))
    // Duplicate names inside the tool's discovery are rejected.
    await assert.rejects(
      () =>
        f.store.createSkill({
          name: 'release-notes',
          description: '重复',
          target: 'claude',
        }),
      /同名/,
    )
    // OpenCode enforces lowercase-hyphen names; ZCode limits description length.
    await assert.rejects(
      () =>
        f.store.createSkill({
          name: 'ReleaseNotes',
          description: '描述',
          target: 'opencode',
        }),
      /OpenCode/,
    )
    await assert.rejects(
      () =>
        f.store.createSkill({
          name: 'big-description',
          description: '超'.repeat(1025),
          target: 'zcode',
        }),
      /1024/,
    )
  } finally {
    await f.cleanup()
  }
})

test('template names reject invalid or reserved directory names', async () => {
  const f = await fixture()
  try {
    for (const name of ['.hidden', 'con', 'com1', 'bad name', 'trailing.']) {
      await assert.rejects(
        () => f.store.createSkill({ name, description: '描述', target: 'library' }),
        /名称/,
      )
    }
    await assert.rejects(
      () => f.store.createSkill({ name: 'valid-name', description: '  ', target: 'library' }),
      /描述/,
    )
    assert.equal((await f.store.scan()).library.length, 0)
  } finally {
    await f.cleanup()
  }
})
