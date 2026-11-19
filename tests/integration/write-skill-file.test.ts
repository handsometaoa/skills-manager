import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { SkillStore } from '../../src/main/services/skill-service'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-write-'))
  const source = path.join(root, 'source', 'review')
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(
    path.join(source, 'SKILL.md'),
    '---\nname: review\ndescription: Review changes carefully\n---\n# Review\n',
  )
  await fs.mkdir(path.join(source, 'references'))
  await fs.writeFile(path.join(source, 'references', 'notes.md'), 'original notes')
  const store = new SkillStore(path.join(root, 'data'), path.join(root, 'home'))
  await store.init()
  return { root, source, store, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}

test('editing a Skill file overwrites content and stays within the Skill root', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['codex'])
    const skill = (await f.store.scan()).skills[0]
    await f.store.writeFile(skill.id, 'references/notes.md', 'updated notes\nsecond line')
    assert.equal(
      await f.store.readFile(skill.id, 'references/notes.md'),
      'updated notes\nsecond line',
    )
    // Writing SKILL.md itself is the primary edit target.
    const updated = '---\nname: review\ndescription: New trigger description\n---\n# Review\n'
    await f.store.writeFile(skill.id, 'SKILL.md', updated)
    assert.equal(await f.store.readFile(skill.id, 'SKILL.md'), updated)
    // No temp files leak into the directory listing after an atomic write.
    assert.deepEqual(
      (await f.store.detail(skill.id)).files.map((file) => file.path),
      ['SKILL.md', 'references/notes.md'],
    )
  } finally {
    await f.cleanup()
  }
})

test('editing rejects escapes, missing files, directories and oversized content', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['codex'])
    const skill = (await f.store.scan()).skills[0]
    await assert.rejects(() => f.store.writeFile(skill.id, '../escape.md', 'x'), /无效文件路径/)
    await assert.rejects(
      () => f.store.writeFile(skill.id, 'references\\notes.md', 'x'),
      /无效文件路径/,
    )
    await assert.rejects(() => f.store.writeFile(skill.id, 'does-not-exist.md', 'x'), /不存在/)
    await assert.rejects(() => f.store.writeFile(skill.id, 'references', 'x'), /普通文件/)
    await assert.rejects(
      () => f.store.writeFile(skill.id, 'SKILL.md', 'x'.repeat(1024 * 1024 + 1)),
      /1MB/,
    )
    // The failed attempts must not have modified anything.
    assert.equal(await f.store.readFile(skill.id, 'references/notes.md'), 'original notes')
  } finally {
    await f.cleanup()
  }
})

test('editing refuses writes that escape through a symlinked directory', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['codex'])
    const skill = (await f.store.scan()).skills[0]
    const outside = path.join(f.root, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'secret.txt'), 'private')
    await fs.symlink(
      outside,
      path.join(skill.path, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    await assert.rejects(
      () => f.store.writeFile(skill.id, 'escape/secret.txt', 'tampered'),
      /无效文件路径|之外/,
    )
    assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'private')
  } finally {
    await f.cleanup()
  }
})
