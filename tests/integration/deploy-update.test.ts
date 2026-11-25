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
    await f.store.writeFile(
      libraryId,
      'SKILL.md',
      '---\nname: review\ndescription: Review v2\n---\n# Review v2\n',
    )
    const libraryDir = (await f.store.scan()).library[0].path
    await fs.writeFile(path.join(libraryDir, 'changelog.md'), 'v2 notes')
    const result = await f.store.deployUpdate(libraryId)
    assert.deepEqual(result.updated.map((copy) => copy.toolId).sort(), ['claude', 'codex'])
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

test('deployUpdate skips unassociated same-name copies by default and can overwrite them', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    await fs.writeFile(path.join(external, 'local.txt'), 'keep me')
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await f.store.writeFile(
      libraryId,
      'SKILL.md',
      '---\nname: review\ndescription: Review v2\n---\n# Review v2\n',
    )
    const plan = await f.store.prepareDeploy(libraryId)
    assert.equal(plan.linked.length, 0)
    assert.equal(plan.conflicts.length, 1)
    assert.equal(plan.conflicts[0].path, external)
    assert.equal(plan.conflicts[0].managed, false)
    assert.equal(plan.conflicts[0].overwritable, true)
    const skipped = await f.store.deployUpdate(libraryId)
    assert.equal(skipped.updated.length, 0)
    assert.match(skipped.skipped[0].reason, /已跳过/)
    assert.equal(await fs.readFile(path.join(external, 'local.txt'), 'utf8'), 'keep me')
    assert.equal(
      (await f.store.scan()).skills.find((s) => s.path === external)?.libraryId,
      undefined,
    )
  } finally {
    await f.cleanup()
  }
})

test('selected same-name conflicts are replaced and associated with the library', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    await fs.writeFile(path.join(external, 'local.txt'), 'discard me')
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await f.store.writeFile(
      libraryId,
      'SKILL.md',
      '---\nname: review\ndescription: Review v2\n---\n# Review v2\n',
    )
    await assert.rejects(
      () => f.store.deployUpdate(libraryId, [path.join(f.root, 'other')]),
      /覆盖目标已变更/,
    )
    const result = await f.store.deployUpdate(libraryId, [external])
    assert.equal(result.updated.length, 1)
    assert.equal(result.updated[0].path, external)
    assert.match(await fs.readFile(path.join(external, 'SKILL.md'), 'utf8'), /Review v2/)
    await assert.rejects(() => fs.access(path.join(external, 'local.txt')))
    const copy = (await f.store.scan()).skills.find((s) => s.path === external)!
    assert.equal(copy.libraryId, libraryId)
    assert.equal(copy.managed, true)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.equal(
      (await reopened.scan()).skills.find((s) => s.path === external)?.libraryId,
      libraryId,
    )
  } finally {
    await f.cleanup()
  }
})

test('an identical selected conflict is associated without replacing its directory', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[1].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    const plan = await f.store.prepareDeploy(libraryId)
    assert.equal(plan.conflicts.length, 1)
    assert.equal(plan.conflicts[0].identical, true)
    assert.deepEqual(plan.conflicts[0].toolIds, [
      'codex',
      'cursor',
      'opencode',
      'gemini',
      'copilot',
    ])
    const result = await f.store.deployUpdate(libraryId, [external])
    assert.equal(result.updated.length, 0)
    assert.match(result.skipped[0].reason, /内容已是最新/)
    const copy = (await f.store.scan()).skills.find((s) => s.path === external)!
    assert.equal(copy.libraryId, libraryId)
    assert.equal(copy.installedBy, 'codex')
  } finally {
    await f.cleanup()
  }
})

test('scoped deployment updates only the selected project copy', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await f.store.installLibrary([libraryId], ['claude', 'codex'])
    const projectCopy = path.join(f.root, 'project', '.claude', 'skills', 'review')
    await fs.mkdir(path.dirname(projectCopy), { recursive: true })
    await fs.cp(f.source, projectCopy, { recursive: true })
    await f.store.recordInstall([{ path: projectCopy, toolId: 'claude', libraryId }], f.source)
    await f.store.writeFile(
      libraryId,
      'SKILL.md',
      '---\nname: review\ndescription: Review v2\n---\n# Review v2\n',
    )
    for (const skill of (await f.store.scan()).skills)
      await fs.writeFile(path.join(skill.path, 'local.txt'), skill.path)
    const result = await f.store.deployUpdate(libraryId, [], [projectCopy])
    assert.deepEqual(
      result.updated.map((copy) => copy.path),
      [projectCopy],
    )
    assert.match(await fs.readFile(path.join(projectCopy, 'SKILL.md'), 'utf8'), /Review v2/)
    for (const skill of (await f.store.scan()).skills.filter((s) => s.path !== projectCopy)) {
      assert.match(
        await fs.readFile(path.join(skill.path, 'SKILL.md'), 'utf8'),
        /Review changes carefully/,
      )
      assert.equal(await fs.readFile(path.join(skill.path, 'local.txt'), 'utf8'), skill.path)
    }
  } finally {
    await f.cleanup()
  }
})

test('deployment refuses a recorded path that now contains a different Skill', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await f.store.installLibrary([libraryId], ['claude'])
    const installed = (await f.store.scan()).skills[0]
    await fs.rm(installed.path, { recursive: true })
    await fs.mkdir(installed.path, { recursive: true })
    await fs.writeFile(
      path.join(installed.path, 'SKILL.md'),
      '---\nname: unrelated\ndescription: Keep this replacement\n---\n',
    )
    await f.store.writeFile(
      libraryId,
      'SKILL.md',
      '---\nname: review\ndescription: Review v2\n---\n# Review v2\n',
    )
    const plan = await f.store.prepareDeploy(libraryId)
    assert.equal(plan.linked[0].status, 'invalid')
    const result = await f.store.deployUpdate(libraryId)
    assert.equal(result.updated.length, 0)
    assert.match(result.skipped[0].reason, /不再是对应 Skill/)
    assert.match(
      await fs.readFile(path.join(installed.path, 'SKILL.md'), 'utf8'),
      /Keep this replacement/,
    )
  } finally {
    await f.cleanup()
  }
})

test('symlink conflicts are shown but cannot be selected for overwrite', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.symlink(f.source, external, process.platform === 'win32' ? 'junction' : 'dir')
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    const plan = await f.store.prepareDeploy(libraryId)
    assert.equal(plan.conflicts.length, 1)
    assert.equal(plan.conflicts[0].overwritable, false)
    await assert.rejects(() => f.store.deployUpdate(libraryId, [external]), /不可覆盖/)
    assert.equal((await f.store.deployUpdate(libraryId)).updated.length, 0)
  } finally {
    await f.cleanup()
  }
})

test('deployUpdate restores replaced copies when saving installation records fails', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await f.store.installLibrary([libraryId], ['claude', 'codex'])
    await f.store.writeFile(
      libraryId,
      'SKILL.md',
      '---\nname: review\ndescription: Review v2\n---\n# Review v2\n',
    )
    const before = (await f.store.scan()).skills.filter((s) => s.libraryId === libraryId)
    for (const skill of before) await fs.writeFile(path.join(skill.path, 'local.txt'), skill.toolId)
    const mutable = f.store as unknown as { save: () => Promise<void> }
    const save = mutable.save.bind(f.store)
    mutable.save = async () => {
      throw new Error('模拟记录写入失败')
    }
    await assert.rejects(() => f.store.deployUpdate(libraryId), /模拟记录写入失败/)
    mutable.save = save
    for (const skill of before) {
      assert.match(
        await fs.readFile(path.join(skill.path, 'SKILL.md'), 'utf8'),
        /Review changes carefully/,
      )
      assert.equal(await fs.readFile(path.join(skill.path, 'local.txt'), 'utf8'), skill.toolId)
    }
    for (const root of [path.dirname(before[0].path), path.dirname(before[1].path)])
      assert.deepEqual(
        (await fs.readdir(root)).filter((name) => name.startsWith('.deploy')),
        [],
      )
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
