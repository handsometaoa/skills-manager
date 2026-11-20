import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { SkillStore } from '../../src/main/services/skill-service'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-deploy-'))
  const source = path.join(root, 'source', 'review')
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(
    path.join(source, 'SKILL.md'),
    '---\nname: review\ndescription: Review changes carefully\n---\n# Review\n',
  )
  const store = new SkillStore(path.join(root, 'data'), path.join(root, 'home'))
  await store.init()
  return { root, source, store, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}

test('deployUpdate copies library content to every linked installation', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await f.store.installLibrary([libraryId], ['claude', 'codex'])
    // Simulate a library content revision (edit an existing file, add a new one).
    await f.store.writeFile(libraryId, 'SKILL.md', '---\nname: review\ndescription: Review v2\n---\n# Review v2\n')
    const libraryDir = (await f.store.scan()).library[0].path
    await fs.writeFile(path.join(libraryDir, 'changelog.md'), 'v2 notes')
    const result = await f.store.deployUpdate(libraryId)
    assert.deepEqual(result.updated.sort(), ['claude', 'codex'])
    assert.deepEqual(result.skipped, [])
    // Both copies now carry the revised content.
    const skills = (await f.store.scan()).skills.filter((s) => s.libraryId === libraryId)
    for (const skill of skills) {
      assert.match(await f.store.readFile(skill.id, 'SKILL.md'), /Review v2/)
      assert.match(await f.store.readFile(skill.id, 'changelog.md'), /v2 notes/)
    }
    // Management records were refreshed with the new file set.
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    const skillsAfter = (await reopened.scan()).skills.filter((s) => s.libraryId === libraryId)
    assert.equal(skillsAfter.length, 2)
    assert.ok(skillsAfter.every((s) => s.managed))
  } finally {
    await f.cleanup()
  }
})

test('deployUpdate skips identical copies and missing targets, rejects without installs', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await assert.rejects(() => f.store.deployUpdate(libraryId), /尚未安装到任何工具/)
    await f.store.installLibrary([libraryId], ['claude'])
    // No content change since install: both installs are skipped as identical.
    const result = await f.store.deployUpdate(libraryId)
    assert.deepEqual(result.updated, [])
    assert.deepEqual(
      result.skipped.map((s) => s.reason),
      ['内容已是最新'],
    )
    // A missing target directory is skipped with a reason instead of failing.
    const record = (await f.store.scan()).skills.find((s) => s.libraryId === libraryId)!
    await fs.rm(record.path, { recursive: true, force: true })
    const result2 = await f.store.deployUpdate(libraryId)
    assert.equal(result2.updated.length, 0)
    assert.match(result2.skipped[0].reason, /目标目录已不存在/)
  } finally {
    await f.cleanup()
  }
})

test('deployUpdate applies per-tool content rules and rolls back on failure', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await f.store.installLibrary([libraryId], ['claude', 'opencode'])
    // Revising the description beyond the OpenCode limit blocks deployment,
    // and the previous copies remain intact (rollback).
    await f.store.writeFile(
      libraryId,
      'SKILL.md',
      `---\nname: review\ndescription: ${'x'.repeat(1025)}\n---\n# Review\n`,
    )
    await assert.rejects(() => f.store.deployUpdate(libraryId), /OpenCode 描述不能超过 1024 字符/)
    const skill = (await f.store.scan()).skills.find((s) => s.libraryId === libraryId)!
    assert.match(await f.store.readFile(skill.id, 'SKILL.md'), /Review changes carefully/)
    // Rollback leaves no staging leftovers behind.
    const parent = path.dirname(skill.path)
    assert.deepEqual(
      (await fs.readdir(parent)).filter((n) => n.startsWith('.deploy')),
      [],
    )
  } finally {
    await f.cleanup()
  }
})
