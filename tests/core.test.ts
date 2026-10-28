import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { SkillStore } from '../src/main/core'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-test-'))
  const source = path.join(root, 'source', 'review')
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: review\ndescription: Review changes carefully\n---\n# Review\n')
  const store = new SkillStore(path.join(root, 'data'), path.join(root, 'home'))
  await store.init()
  return { root, source, store, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}
test('multi-tool install persists, protects conflicts and keeps uninstall backup', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['claude', 'codex', 'zcode'])
    assert.equal((await f.store.scan()).skills.length, 3)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.ok((await reopened.scan()).skills.every(s => s.managed))
    await assert.rejects(() => reopened.install(f.source, ['claude']), /目标已存在/)
    const skill = (await reopened.scan()).skills[0]
    await reopened.uninstall(skill.id)
    assert.equal((await reopened.scan()).skills.length, 2)
    const backups = (await fs.readdir(path.dirname(skill.path))).filter(p => p.startsWith('.removed-'))
    assert.equal(backups.length, 1)
    assert.ok(await fs.readFile(path.join(path.dirname(skill.path), backups[0], 'SKILL.md'), 'utf8'))
  } finally { await f.cleanup() }
})
test('modified and newly added files prevent uninstall', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['zcode'])
    const skill = (await f.store.scan()).skills[0]
    await fs.writeFile(path.join(skill.path, 'notes.txt'), 'user content')
    await assert.rejects(() => f.store.uninstall(skill.id), /修改或新增/)
    assert.equal((await f.store.scan()).skills.length, 1)
    await fs.unlink(path.join(skill.path, 'notes.txt'))
    await fs.appendFile(path.join(skill.path, 'SKILL.md'), 'user changes')
    await assert.rejects(() => f.store.uninstall(skill.id), /修改或新增/)
  } finally { await f.cleanup() }
})
test('external skills cannot be uninstalled and malformed metadata is diagnosed', async () => {
  const f = await fixture()
  try {
    const root = f.store.tools[0].root
    await fs.mkdir(root, { recursive: true })
    await fs.cp(f.source, path.join(root, 'review'), { recursive: true })
    const skill = (await f.store.scan()).skills[0]
    assert.equal(skill.managed, false)
    await assert.rejects(() => f.store.uninstall(skill.id), /仅支持/)
    await fs.writeFile(path.join(root, 'review', 'SKILL.md'), '---\nname: review\n---\n')
    assert.equal((await f.store.scan()).diagnostics.length, 1)
  } finally { await f.cleanup() }
})
test('copy external ZCode skill into Codex preserves source and auxiliary files', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    await fs.mkdir(path.join(external, 'references'))
    await fs.writeFile(path.join(external, 'references', 'checklist.md'), 'checklist')
    const candidate = await f.store.prepareCopy((await f.store.scan()).skills[0].id)
    await f.store.install(candidate.path, ['codex'])
    const snapshot = await f.store.scan()
    assert.equal(snapshot.skills.length, 2)
    assert.equal(snapshot.skills.find(s => s.toolId === 'zcode')!.managed, false)
    const copy = snapshot.skills.find(s => s.toolId === 'codex')!
    assert.equal(copy.managed, true)
    assert.equal(await fs.readFile(path.join(copy.path, 'references', 'checklist.md'), 'utf8'), 'checklist')
    await fs.writeFile(path.join(copy.path, 'references', 'checklist.md'), 'independent copy')
    assert.equal(await fs.readFile(path.join(external, 'references', 'checklist.md'), 'utf8'), 'checklist')
  } finally { await f.cleanup() }
})
test('external deletion uses recovery provider only for external scanned directories', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    const id = (await f.store.scan()).skills[0].id
    let calls = 0
    const recovery = path.join(f.root, 'test-recycle-bin')
    await f.store.deleteExternal(id, async directory => { calls++; assert.equal(directory, external); await fs.rename(directory, recovery) })
    assert.equal(calls, 1)
    assert.equal((await f.store.scan()).skills.length, 0)
    assert.ok(await fs.readFile(path.join(recovery, 'SKILL.md')))
    await f.store.install(f.source, ['codex'])
    const managed = (await f.store.scan()).skills[0]
    await assert.rejects(() => f.store.deleteExternal('../../elsewhere', async () => { calls++ }), /仅支持/)
    await assert.rejects(() => f.store.deleteExternal(managed.id, async () => { calls++ }), /仅支持/)
    assert.equal(calls, 1)
  } finally { await f.cleanup() }
})
test('browse lists supporting files and reads UTF-8 content within the Skill directory', async () => {
  const f = await fixture()
  try {
    await fs.mkdir(path.join(f.source, 'references'))
    await fs.writeFile(path.join(f.source, 'references', 'guide.md'), '# 指南\n\n测试内容。')
    await f.store.install(f.source, ['zcode'])
    const skill = (await f.store.scan()).skills[0]
    const detail = await f.store.detail(skill.id)
    assert.equal(detail.files[0].path, 'SKILL.md')
    assert.ok(detail.files.some(file => file.path === 'references/guide.md'))
    assert.equal(await f.store.readFile(skill.id, 'references/guide.md'), '# 指南\n\n测试内容。')
    assert.match(await f.store.readFile(skill.id, 'SKILL.md'), /name: review/)
    for (const invalid of ['../secret.txt', '/secret.txt', 'references/../../secret.txt', 'C:/secret', 'references\\guide.md']) {
      await assert.rejects(() => f.store.readFile(skill.id, invalid), /无效文件路径/)
    }
    await assert.rejects(() => f.store.detail('unknown-skill'), /已不存在/)
    await fs.writeFile(path.join(skill.path, 'binary.bin'), Buffer.from([0, 1, 2]))
    await assert.rejects(() => f.store.readFile(skill.id, 'binary.bin'), /二进制/)
    await fs.writeFile(path.join(skill.path, 'large.txt'), 'a'.repeat(1024 * 1024 + 1))
    await assert.rejects(() => f.store.readFile(skill.id, 'large.txt'), /1MB/)
    await fs.writeFile(path.join(skill.path, 'bad-encoding.txt'), Buffer.from([0xff, 0xfe]))
    await assert.rejects(() => f.store.readFile(skill.id, 'bad-encoding.txt'), /编码/)
    assert.ok((await f.store.readFile(skill.id, 'SKILL.md')).includes('# Review'))
  } finally { await f.cleanup() }
})
test('browse rejects files reached through a junction outside the Skill root', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['codex'])
    const skill = (await f.store.scan()).skills[0]
    const outside = path.join(f.root, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'secret.txt'), 'private')
    await fs.symlink(outside, path.join(skill.path, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.ok(!(await f.store.detail(skill.id)).files.some(file => file.path.startsWith('escape/')))
    await assert.rejects(() => f.store.readFile(skill.id, 'escape/secret.txt'), /之外/)
  } finally { await f.cleanup() }
})
test('ZCode validation rejects oversize descriptions without partial installs', async () => {
  const f = await fixture()
  try {
    await fs.writeFile(path.join(f.source, 'SKILL.md'), `---\nname: review\ndescription: ${'a'.repeat(1025)}\n---\n`)
    await assert.rejects(() => f.store.install(f.source, ['claude', 'zcode']), /1024/)
    assert.equal((await f.store.scan()).skills.length, 0)
  } finally { await f.cleanup() }
})

test('central library persists independent copies, browses and installs with a source association', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: 'https://example.org/team/skills#review' }], 'all')
    const first = await f.store.scan()
    assert.equal(first.skills.length, 0)
    assert.equal(first.library.length, 1)
    const entry = first.library[0]
    assert.equal(entry.toolId, 'library')
    await fs.appendFile(path.join(f.source, 'SKILL.md'), 'source changed')
    assert.ok(!(await f.store.readFile(entry.id, 'SKILL.md')).includes('source changed'))
    assert.equal((await f.store.detail(entry.id)).files[0].path, 'SKILL.md')
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.equal((await reopened.scan()).library[0].compatibility, 'all')
    await reopened.installLibrary([entry.id], ['codex', 'zcode'])
    const installed = (await reopened.scan()).skills
    assert.equal(installed.length, 2)
    assert.ok(installed.every(s => s.libraryId === entry.id))
    assert.ok(installed.every(s => s.source === 'https://example.org/team/skills#review'))
    await reopened.deleteLibrary(entry.id, directory => fs.rename(directory, path.join(f.root, 'recycled')))
    assert.equal((await reopened.scan()).library.length, 0)
    assert.equal((await reopened.scan()).skills.length, 2)
    assert.ok(await fs.readFile(path.join(installed[0].path, 'SKILL.md')))
  } finally { await f.cleanup() }
})
test('tool-specific skills can be collected and enforce an editable compatibility scope', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    await f.store.collectSkill((await f.store.scan()).skills[0].id, 'zcode')
    const entry = (await f.store.scan()).library[0]
    await assert.rejects(() => f.store.installLibrary([entry.id], ['codex']), /工具专用/)
    assert.equal((await f.store.scan()).skills.length, 1)
    await f.store.setCompatibility(entry.id, 'all')
    await f.store.installLibrary([entry.id], ['codex'])
    assert.ok(await fs.readFile(path.join(external, 'SKILL.md')))
    assert.equal((await f.store.scan()).skills.length, 2)
  } finally { await f.cleanup() }
})
test('batch library import and installation roll back on conflicts', async () => {
  const f = await fixture()
  try {
    await assert.rejects(() => f.store.addToLibrary([{ path: f.source, source: f.source }, { path: f.source, source: f.source }], 'all'), /同名/)
    assert.equal((await f.store.scan()).library.length, 0)
    const second = path.join(f.root, 'source', 'release')
    await fs.cp(f.source, second, { recursive: true })
    await f.store.addToLibrary([{ path: f.source, source: f.source }, { path: second, source: second }], 'all')
    await f.store.install(second, ['codex'])
    const libraryIds = (await f.store.scan()).library.map(s => s.id)
    await assert.rejects(() => f.store.installLibrary(libraryIds, ['codex']), /目标已存在/)
    const snapshot = await f.store.scan()
    assert.equal(snapshot.skills.length, 1)
    assert.equal(snapshot.skills[0].name, 'release')
    await assert.rejects(() => f.store.deleteLibrary(snapshot.library[0].id, async () => { throw new Error('trash unavailable') }), /trash unavailable/)
    assert.equal((await f.store.scan()).library.length, 2)
  } finally { await f.cleanup() }
})
