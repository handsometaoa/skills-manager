import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { SkillStore } from '../../src/main/services/skill-service'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-test-'))
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
test('multi-tool install persists, protects conflicts and recycles managed skills', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['claude', 'codex', 'zcode'])
    assert.equal((await f.store.scan()).skills.length, 3)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.ok((await reopened.scan()).skills.every((s) => s.managed))
    await assert.rejects(() => reopened.install(f.source, ['claude']), /目标已存在/)
    const skill = (await reopened.scan()).skills[0]
    await reopened.uninstall(skill.id)
    assert.equal((await reopened.scan()).skills.length, 2)
    const trash = (await reopened.scan()).trash
    assert.equal(trash.length, 1)
    assert.equal(trash[0].originalPath, skill.path)
    await reopened.restoreTrash(trash[0].id)
    const restored = (await reopened.scan()).skills.find((s) => s.id === skill.id)
    assert.equal(restored?.managed, true)
    assert.ok(await fs.readFile(path.join(skill.path, 'SKILL.md'), 'utf8'))
  } finally {
    await f.cleanup()
  }
})
test('recycling and restoring a modified managed Skill preserves all user changes', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['zcode'])
    const skill = (await f.store.scan()).skills[0]
    await fs.writeFile(path.join(skill.path, 'notes.txt'), 'user content')
    await fs.appendFile(path.join(skill.path, 'SKILL.md'), 'user changes')
    await f.store.uninstall(skill.id)
    assert.equal((await f.store.scan()).skills.length, 0)
    await f.store.restoreTrash((await f.store.scan()).trash[0].id)
    assert.equal(await fs.readFile(path.join(skill.path, 'notes.txt'), 'utf8'), 'user content')
    assert.match(await f.store.readFile(skill.id, 'SKILL.md'), /user changes/)
  } finally {
    await f.cleanup()
  }
})

test('uninstall removes a stale installation record when its directory is already missing', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['claude'])
    const record = f.store.findInstallByPath(path.join(f.store.tools[0].root, 'review'))!
    await fs.rm(record.path, { recursive: true })
    await f.store.uninstall(record.id)
    assert.equal(f.store.findInstallById(record.id), undefined)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.equal(reopened.findInstallById(record.id), undefined)
  } finally {
    await f.cleanup()
  }
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
  } finally {
    await f.cleanup()
  }
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
    assert.equal(snapshot.skills.find((s) => s.toolId === 'zcode')!.managed, false)
    const copy = snapshot.skills.find((s) => s.toolId === 'codex')!
    assert.equal(copy.managed, true)
    assert.equal(
      await fs.readFile(path.join(copy.path, 'references', 'checklist.md'), 'utf8'),
      'checklist',
    )
    await fs.writeFile(path.join(copy.path, 'references', 'checklist.md'), 'independent copy')
    assert.equal(
      await fs.readFile(path.join(external, 'references', 'checklist.md'), 'utf8'),
      'checklist',
    )
  } finally {
    await f.cleanup()
  }
})
test('external deletion persists in app trash, restores supporting files and rejects invalid ids', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    await fs.writeFile(path.join(external, 'notes.txt'), 'user content')
    const id = (await f.store.scan()).skills[0].id
    await f.store.deleteExternal(id)
    assert.equal((await f.store.scan()).skills.length, 0)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    const entry = (await reopened.scan()).trash[0]
    assert.equal(entry.originalPath, external)
    await reopened.restoreTrash(entry.id)
    assert.equal(await fs.readFile(path.join(external, 'notes.txt'), 'utf8'), 'user content')
    assert.equal((await reopened.scan()).skills[0].managed, false)
    assert.equal((await reopened.scan()).trash.length, 0)
    await assert.rejects(() => reopened.deleteExternal('../../elsewhere'), /仅支持/)
    await reopened.install(f.source, ['codex'])
    const managed = (await reopened.scan()).skills.find((s) => s.managed)!
    await assert.rejects(() => reopened.deleteExternal(managed.id), /仅支持/)
  } finally {
    await f.cleanup()
  }
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
    assert.ok(detail.files.some((file) => file.path === 'references/guide.md'))
    assert.equal(await f.store.readFile(skill.id, 'references/guide.md'), '# 指南\n\n测试内容。')
    assert.match(await f.store.readFile(skill.id, 'SKILL.md'), /name: review/)
    for (const invalid of [
      '../secret.txt',
      '/secret.txt',
      'references/../../secret.txt',
      'C:/secret',
      'references\\guide.md',
    ]) {
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
  } finally {
    await f.cleanup()
  }
})
test('browse rejects files reached through a junction outside the Skill root', async () => {
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
    assert.ok(
      !(await f.store.detail(skill.id)).files.some((file) => file.path.startsWith('escape/')),
    )
    await assert.rejects(() => f.store.readFile(skill.id, 'escape/secret.txt'), /之外/)
  } finally {
    await f.cleanup()
  }
})
test('ZCode validation rejects oversize descriptions without partial installs', async () => {
  const f = await fixture()
  try {
    await fs.writeFile(
      path.join(f.source, 'SKILL.md'),
      `---\nname: review\ndescription: ${'a'.repeat(1025)}\n---\n`,
    )
    await assert.rejects(() => f.store.install(f.source, ['claude', 'zcode']), /1024/)
    assert.equal((await f.store.scan()).skills.length, 0)
  } finally {
    await f.cleanup()
  }
})

test('central library persists independent copies, browses and installs with a source association', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary(
      [{ path: f.source, source: 'https://example.org/team/skills#review' }],
      'all',
    )
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
    assert.ok(installed.every((s) => s.libraryId === entry.id))
    assert.ok(installed.every((s) => s.source === 'https://example.org/team/skills#review'))
    await reopened.deleteLibrary(entry.id)
    assert.equal((await reopened.scan()).trash.length, 1)
    await reopened.restoreTrash((await reopened.scan()).trash[0].id)
    assert.equal((await reopened.scan()).library[0].id, entry.id)
    assert.equal((await reopened.scan()).library.length, 1)
    assert.equal((await reopened.scan()).skills.length, 2)
    assert.ok(await fs.readFile(path.join(installed[0].path, 'SKILL.md')))
  } finally {
    await f.cleanup()
  }
})
test('tool-specific skills can be collected and enforce an editable compatibility scope', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[2].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    await f.store.collectSkill((await f.store.scan()).skills[0].id, ['zcode'])
    const snapshot = await f.store.scan()
    const entry = snapshot.library[0]
    assert.equal(snapshot.skills[0].libraryId, entry.id)
    assert.equal(snapshot.skills[0].managed, true)
    assert.equal(snapshot.skills[0].path, external)
    await assert.rejects(() => f.store.installLibrary([entry.id], ['codex']), /工具专用/)
    assert.equal((await f.store.scan()).skills.length, 1)
    await f.store.setCompatibility(entry.id, 'all')
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.equal(
      (await reopened.scan()).skills.find((s) => s.path === external)?.libraryId,
      entry.id,
    )
    await reopened.installLibrary([entry.id], ['codex'])
    assert.ok(await fs.readFile(path.join(external, 'SKILL.md')))
    assert.equal((await f.store.scan()).skills.length, 2)
  } finally {
    await f.cleanup()
  }
})
test('an associated Agent copy can synchronize its full content back to the library', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[0].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    const agent = (await f.store.scan()).skills[0]
    await f.store.collectSkill(agent.id, 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await fs.writeFile(
      path.join(external, 'SKILL.md'),
      '---\nname: review\ndescription: Review from Agent\n---\n# Agent\n',
    )
    await fs.writeFile(path.join(external, 'agent.txt'), 'new file')
    await f.store.syncToLibrary((await f.store.scan()).skills.find((s) => s.path === external)!.id)
    const library = (await f.store.scan()).library[0]
    assert.equal(library.id, libraryId)
    assert.match(await f.store.readFile(libraryId, 'SKILL.md'), /Review from Agent/)
    assert.equal(await f.store.readFile(libraryId, 'agent.txt'), 'new file')
    assert.equal((await f.store.scan()).library.length, 1)
  } finally {
    await f.cleanup()
  }
})

test('syncToLibrary restores the previous repository content when final verification fails', async () => {
  const f = await fixture()
  try {
    const external = path.join(f.store.tools[0].root, 'review')
    await fs.mkdir(path.dirname(external), { recursive: true })
    await fs.cp(f.source, external, { recursive: true })
    const agent = (await f.store.scan()).skills[0]
    await f.store.collectSkill(agent.id, 'all')
    const libraryId = (await f.store.scan()).library[0].id
    await fs.writeFile(
      path.join(external, 'SKILL.md'),
      '---\nname: review\ndescription: Review from Agent\n---\n# Agent\n',
    )
    const mutable = f.store as unknown as {
      hashes: (dir: string) => Promise<Record<string, string>>
    }
    const hashes = mutable.hashes.bind(f.store)
    mutable.hashes = async (dir) => {
      if (dir === (await f.store.scan()).library[0].path) throw new Error('模拟同步校验失败')
      return hashes(dir)
    }
    const currentAgentId = (await f.store.scan()).skills.find((s) => s.path === external)!.id
    await assert.rejects(() => f.store.syncToLibrary(currentAgentId), /模拟同步校验失败/)
    mutable.hashes = hashes
    assert.match(await f.store.readFile(libraryId, 'SKILL.md'), /Review changes carefully/)
    assert.deepEqual(
      (await fs.readdir(path.dirname((await f.store.scan()).library[0].path))).filter((name) =>
        name.startsWith('.sync'),
      ),
      [],
    )
  } finally {
    await f.cleanup()
  }
})

test('batch library import and installation roll back on conflicts', async () => {
  const f = await fixture()
  try {
    await assert.rejects(
      () =>
        f.store.addToLibrary(
          [
            { path: f.source, source: f.source },
            { path: f.source, source: f.source },
          ],
          'all',
        ),
      /同名/,
    )
    assert.equal((await f.store.scan()).library.length, 0)
    const second = path.join(f.root, 'source', 'release')
    await fs.cp(f.source, second, { recursive: true })
    await f.store.addToLibrary(
      [
        { path: f.source, source: f.source },
        { path: second, source: second },
      ],
      'all',
    )
    await f.store.install(second, ['codex'])
    const libraryIds = (await f.store.scan()).library.map((s) => s.id)
    await assert.rejects(() => f.store.installLibrary(libraryIds, ['codex']), /目标已存在/)
    const snapshot = await f.store.scan()
    assert.equal(snapshot.skills.length, 1)
    assert.equal(snapshot.skills[0].name, 'release')
    await f.store.deleteLibrary(snapshot.library[0].id)
    assert.equal((await f.store.scan()).library.length, 1)
    assert.equal((await f.store.scan()).trash.length, 1)
  } finally {
    await f.cleanup()
  }
})

test('all eight tools install to documented roots and shared files keep one management identity', async () => {
  const f = await fixture()
  try {
    const tools = f.store.tools
    assert.equal(tools.length, 8)
    assert.ok(!tools.some((tool) => (tool.id as string) === 'windsurf'))
    assert.equal(
      tools.find((tool) => tool.id === 'cursor')!.root,
      path.join(f.root, 'home', '.cursor', 'skills'),
    )
    assert.equal(
      tools.find((tool) => tool.id === 'opencode')!.root,
      path.join(f.root, 'home', '.config', 'opencode', 'skills'),
    )
    await f.store.install(
      f.source,
      tools.map((tool) => tool.id),
    )
    const snapshot = await f.store.scan()
    assert.equal(snapshot.skills.length, 8)
    assert.equal(new Set(snapshot.skills.map((skill) => skill.id)).size, 8)
    const codex = snapshot.skills.find((skill) => skill.installedBy === 'codex')!
    assert.deepEqual(codex.discoveredBy, ['codex', 'cursor', 'opencode', 'gemini', 'copilot'])
    const claude = snapshot.skills.find((skill) => skill.installedBy === 'claude')!
    assert.deepEqual(claude.discoveredBy, ['claude', 'cursor', 'opencode'])
    for (const tool of tools)
      assert.ok(await fs.readFile(path.join(tool.root, 'review', 'SKILL.md')))
    await f.store.uninstall(codex.id)
    assert.ok(!(await f.store.scan()).skills.some((skill) => skill.id === codex.id))
    assert.ok(
      await fs.readFile(
        path.join(tools.find((tool) => tool.id === 'cursor')!.root, 'review', 'SKILL.md'),
      ),
    )
  } finally {
    await f.cleanup()
  }
})

test('shared discovery prevents duplicate installs and preserves unrelated target directories', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['codex'])
    const original = (await f.store.scan()).skills[0]
    await assert.rejects(() => f.store.install(f.source, ['qoder', 'cursor']), /共享/)
    assert.equal((await f.store.scan()).skills.length, 1)
    assert.ok(
      !(await fs
        .stat(path.join(f.store.tools.find((tool) => tool.id === 'qoder')!.root, 'review'))
        .catch(() => null)),
    )
    await f.store.uninstall(original.id)
    assert.equal((await f.store.scan()).skills.length, 0)
    await f.store.install(f.source, ['cursor', 'qoder'])
    assert.equal((await f.store.scan()).skills.length, 2)
  } finally {
    await f.cleanup()
  }
})

test('shared Skills restore discovery and installation identity for all readers', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['codex'])
    const skill = (await f.store.scan()).skills[0]
    await f.store.uninstall(skill.id)
    assert.equal((await f.store.scan()).skills.length, 0)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    await reopened.restoreTrash((await reopened.scan()).trash[0].id)
    const restored = (await reopened.scan()).skills[0]
    assert.equal(restored.id, skill.id)
    assert.equal(restored.installedBy, 'codex')
    assert.deepEqual(restored.discoveredBy, skill.discoveredBy)
  } finally {
    await f.cleanup()
  }
})

test('recycle and restore roll back content when installation records cannot be saved', async (t) => {
  const f = await fixture()
  const rename = fs.rename.bind(fs)
  let failSave = false
  const mocked = t.mock.method(
    fs,
    'rename',
    async (
      source: Parameters<typeof fs.rename>[0],
      destination: Parameters<typeof fs.rename>[1],
    ) => {
      if (failSave && destination === path.join(f.root, 'data', 'installations.json'))
        throw new Error('simulated record write failure')
      return rename(source, destination)
    },
  )
  try {
    await f.store.install(f.source, ['zcode'])
    const skill = (await f.store.scan()).skills[0]
    failSave = true
    await assert.rejects(() => f.store.uninstall(skill.id), /record write failure/)
    assert.equal((await f.store.scan()).skills[0].id, skill.id)
    assert.equal((await f.store.scan()).trash.length, 0)
    assert.ok(await fs.readFile(path.join(skill.path, 'SKILL.md')))
    failSave = false
    await f.store.uninstall(skill.id)
    const entry = (await f.store.scan()).trash[0]
    failSave = true
    await assert.rejects(() => f.store.restoreTrash(entry.id), /record write failure/)
    assert.equal((await f.store.scan()).skills.length, 0)
    assert.equal((await f.store.scan()).trash[0].id, entry.id)
    failSave = false
    await f.store.restoreTrash(entry.id)
    assert.equal((await f.store.scan()).skills[0].id, skill.id)
  } finally {
    mocked.mock.restore()
    await f.cleanup()
  }
})

test('cross-device recycle verifies a complete copy and supports restoration', async (t) => {
  const f = await fixture()
  const rename = fs.rename.bind(fs)
  try {
    await f.store.install(f.source, ['codex'])
    const skill = (await f.store.scan()).skills[0]
    await fs.writeFile(path.join(skill.path, 'notes.txt'), 'keep this change')
    const mocked = t.mock.method(
      fs,
      'rename',
      async (
        source: Parameters<typeof fs.rename>[0],
        destination: Parameters<typeof fs.rename>[1],
      ) => {
        if (source === skill.path && String(destination).includes(`${path.sep}trash${path.sep}`))
          throw Object.assign(new Error('cross-device move'), { code: 'EXDEV' })
        return rename(source, destination)
      },
    )
    await f.store.uninstall(skill.id)
    mocked.mock.restore()
    assert.equal((await f.store.scan()).skills.length, 0)
    await f.store.restoreTrash((await f.store.scan()).trash[0].id)
    assert.equal(await fs.readFile(path.join(skill.path, 'notes.txt'), 'utf8'), 'keep this change')
  } finally {
    t.mock.restoreAll()
    await f.cleanup()
  }
})

test('trash restore refuses occupied paths and duplicate library scopes; permanent deletion removes only its entry', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['zcode'])
    const skill = (await f.store.scan()).skills[0]
    await f.store.uninstall(skill.id)
    const first = (await f.store.scan()).trash[0]
    await fs.mkdir(skill.path)
    await fs.writeFile(path.join(skill.path, 'precious.txt'), 'keep me')
    await assert.rejects(() => f.store.restoreTrash(first.id), /同名目录/)
    assert.equal(await fs.readFile(path.join(skill.path, 'precious.txt'), 'utf8'), 'keep me')
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    await f.store.deleteLibrary((await f.store.scan()).library[0].id)
    const second = (await f.store.scan()).trash.find((entry) => entry.id !== first.id)!
    await f.store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    await assert.rejects(() => f.store.restoreTrash(second.id), /同名/)
    await f.store.deleteTrash(first.id)
    assert.equal((await f.store.scan()).trash.length, 1)
    await assert.rejects(() => f.store.restoreTrash(first.id), /不存在/)
    await assert.rejects(() => f.store.deleteTrash('../outside'), /不存在/)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.equal((await reopened.scan()).trash[0].id, second.id)
  } finally {
    await f.cleanup()
  }
})

test('multi-tool compatibility persists, compares sets and rejects unsupported targets atomically', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: f.source }], ['qoder', 'cursor'])
    const item = (await f.store.scan()).library[0]
    assert.deepEqual(item.compatibility, ['cursor', 'qoder'])
    await assert.rejects(
      () => f.store.addToLibrary([{ path: f.source, source: f.source }], ['cursor', 'qoder']),
      /同名/,
    )
    await assert.rejects(() => f.store.installLibrary([item.id], ['cursor', 'gemini']), /工具专用/)
    assert.equal((await f.store.scan()).skills.length, 0)
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.deepEqual((await reopened.scan()).library[0].compatibility, ['cursor', 'qoder'])
    await reopened.installLibrary([item.id], ['cursor', 'qoder'])
    assert.equal((await reopened.scan()).skills.length, 2)
    await reopened.setCompatibility(item.id, ['gemini', 'copilot'])
    assert.deepEqual((await reopened.scan()).library[0].compatibility, ['gemini', 'copilot'])
  } finally {
    await f.cleanup()
  }
})

test('legacy single-tool library records migrate without moving files or losing associations', async () => {
  const f = await fixture()
  try {
    await f.store.addToLibrary([{ path: f.source, source: 'original-source' }], ['zcode'])
    const item = (await f.store.scan()).library[0]
    await f.store.installLibrary([item.id], ['zcode'])
    const file = path.join(f.root, 'data', 'library.json')
    const records = JSON.parse(await fs.readFile(file, 'utf8'))
    records[0].compatibility = 'zcode'
    await fs.writeFile(file, JSON.stringify(records))
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    const result = await reopened.scan()
    assert.deepEqual(result.library[0].compatibility, ['zcode'])
    assert.equal(result.library[0].path, item.path)
    assert.equal(result.library[0].source, 'original-source')
    assert.equal(result.skills[0].libraryId, item.id)
    assert.equal(result.skills[0].managed, true)
    await reopened.setCompatibility(item.id, ['zcode', 'qoder'])
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8'))[0].compatibility, [
      'zcode',
      'qoder',
    ])
    records[0].compatibility = []
    await fs.writeFile(file, JSON.stringify(records))
    await assert.rejects(
      () => new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home')).init(),
      /适用工具/,
    )
  } finally {
    await f.cleanup()
  }
})

test('Cursor legacy compatibility directories are discoverable and OpenCode validates its stricter format', async () => {
  const f = await fixture()
  try {
    const legacy = path.join(f.root, 'home', '.codex', 'skills', 'review')
    await fs.mkdir(path.dirname(legacy), { recursive: true })
    await fs.cp(f.source, legacy, { recursive: true })
    const skill = (await f.store.scan()).skills[0]
    assert.deepEqual(skill.discoveredBy, ['cursor'])
    assert.equal(skill.managed, false)
    assert.match(await f.store.readFile(skill.id, 'SKILL.md'), /# Review/)
    await fs.writeFile(
      path.join(f.source, 'SKILL.md'),
      '---\nname: another-name\ndescription: Review\n---\n',
    )
    await assert.rejects(() => f.store.install(f.source, ['qoder', 'opencode']), /OpenCode/)
    assert.equal((await f.store.scan()).skills.length, 1)
    await fs.writeFile(
      path.join(f.source, 'SKILL.md'),
      `---\nname: review\ndescription: ${'a'.repeat(1025)}\n---\n`,
    )
    await assert.rejects(() => f.store.install(f.source, ['opencode']), /1024/)
  } finally {
    await f.cleanup()
  }
})
