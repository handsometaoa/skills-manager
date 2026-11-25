import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ProjectService } from '../../src/main/services/project-service'
import { SkillStore } from '../../src/main/services/skill-service'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-project-'))
  const project = path.join(root, 'my-app')
  await fs.mkdir(path.join(project, '.claude', 'skills', 'review'), { recursive: true })
  await fs.writeFile(
    path.join(project, '.claude', 'skills', 'review', 'SKILL.md'),
    '---\nname: review\ndescription: Review changes carefully\n---\n# Review\n',
  )
  await fs.writeFile(path.join(project, '.claude', 'skills', 'review', 'notes.md'), 'notes')
  await fs.mkdir(path.join(project, '.agents', 'skills', 'release'), { recursive: true })
  await fs.writeFile(
    path.join(project, '.agents', 'skills', 'release', 'SKILL.md'),
    '---\nname: release\ndescription: Release notes\n---\n',
  )
  const store = new SkillStore(path.join(root, 'data'), path.join(root, 'home'))
  await store.init()
  const registered = new Set<string>()
  const projects = new ProjectService(
    (path) => registered.add(path),
    (absPath) => {
      const record = store.findInstallByPath(absPath)
      return record ? { managed: true, libraryId: record.libraryId } : { managed: false }
    },
    (absPath, toolId, compatibility) => store.collectPath(absPath, compatibility, toolId),
    (skill) => store.syncPathToLibrary(skill),
  )
  return {
    root,
    project,
    store,
    projects,
    registered,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  }
}

test('scan groups project skills per Agent directory and registers their sources', async () => {
  const f = await fixture()
  try {
    const scan = await f.projects.scan(f.project)
    assert.equal(scan.projectPath, path.resolve(f.project))
    assert.equal(scan.tools.length, 7)
    const claude = scan.tools.find((t) => t.toolId === 'claude')!
    assert.equal(claude.directory, path.join(path.resolve(f.project), '.claude', 'skills'))
    assert.deepEqual(
      claude.skills.map((s) => s.name),
      ['review'],
    )
    const codex = scan.tools.find((t) => t.toolId === 'codex')!
    assert.deepEqual(
      codex.skills.map((s) => s.name),
      ['release'],
    )
    // Undocumented ZCode stays out of the matrix.
    assert.ok(!scan.tools.some((t) => t.toolId === 'zcode'))
    assert.ok(f.registered.has(claude.skills[0].path))
  } finally {
    await f.cleanup()
  }
})

test('browse, read and write work within the project and reject escapes', async () => {
  const f = await fixture()
  try {
    await f.projects.scan(f.project)
    const skillPath = path.join(f.project, '.claude', 'skills', 'review')
    const detail = await f.projects.browse(skillPath)
    assert.equal(detail.skill.name, 'review')
    assert.deepEqual(
      detail.files.map((file) => file.path),
      ['SKILL.md', 'notes.md'],
    )
    assert.equal(await f.projects.readFile(skillPath, 'notes.md'), 'notes')
    await f.projects.writeFile(skillPath, 'notes.md', 'updated notes')
    assert.equal(await f.projects.readFile(skillPath, 'notes.md'), 'updated notes')
    await assert.rejects(() => f.projects.readFile(skillPath, '../outside.md'), /无效文件路径/)
    try {
      await f.projects.browse(path.join(f.project, 'unknown'))
      assert.fail('应拒绝未知路径')
    } catch (e) {
      assert.match((e as Error).message, /不在扫描结果中/)
    }
  } finally {
    await f.cleanup()
  }
})

test('project collection associates the original and project changes sync back to the library', async () => {
  const f = await fixture()
  try {
    const scan = await f.projects.scan(f.project)
    const skillPath = scan.tools.find((t) => t.toolId === 'claude')!.skills[0].path
    await f.projects.collectSkill(skillPath, 'all')
    const library = (await f.store.scan()).library
    assert.equal(library.length, 1)
    assert.equal(f.store.findInstallByPath(skillPath)?.libraryId, library[0].id)
    assert.equal((await f.projects.scan(f.project)).tools[0].skills[0].libraryId, library[0].id)
    await assert.rejects(() => f.projects.collectSkill(skillPath, ['zcode']), /已有同名 Skill/)
    await fs.writeFile(
      path.join(skillPath, 'SKILL.md'),
      '---\nname: review\ndescription: Review from project\n---\n# Project\n',
    )
    await fs.writeFile(path.join(skillPath, 'project.txt'), 'project changes')
    await f.projects.syncToLibrary(skillPath)
    assert.match(await f.store.readFile(library[0].id, 'SKILL.md'), /Review from project/)
    assert.equal(await f.store.readFile(library[0].id, 'project.txt'), 'project changes')
    const reopened = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await reopened.init()
    assert.equal(reopened.findInstallByPath(skillPath)?.libraryId, library[0].id)
  } finally {
    await f.cleanup()
  }
})

test('delete recycles a project skill and restores it to the project path', async () => {
  const f = await fixture()
  try {
    const scan = await f.projects.scan(f.project)
    const skillPath = scan.tools.find((t) => t.toolId === 'claude')!.skills[0].path
    await f.store.deleteExternalPath(skillPath)
    assert.equal((await f.projects.scan(f.project)).tools[0].skills.length, 0)
    const trash = (await f.store.scan()).trash
    assert.equal(trash.length, 1)
    assert.equal(trash[0].originalPath, skillPath)
    await f.store.restoreTrash(trash[0].id)
    assert.ok(await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf8'))
  } finally {
    await f.cleanup()
  }
})

test('install copies library skills into project directories with rollback', async () => {
  const f = await fixture()
  try {
    const source = path.join(f.root, 'library-source', 'review')
    await fs.mkdir(source, { recursive: true })
    await fs.writeFile(
      path.join(source, 'SKILL.md'),
      '---\nname: review\ndescription: Review changes carefully\n---\n# Review\n',
    )
    await f.projects.scan(f.project)
    // Install from an arbitrary registered source into the empty Qoder dir
    // (the fixture's .claude/skills already holds a review skill).
    const created = await f.projects.install({
      sources: [source],
      toolId: 'qoder',
      projectPath: f.project,
    })
    assert.deepEqual(created, [path.join(path.resolve(f.project), '.qoder', 'skills', 'review')])
    const scan = await f.projects.scan(f.project)
    assert.deepEqual(
      scan.tools.find((t) => t.toolId === 'qoder')!.skills.map((s) => s.name),
      ['review'],
    )
    // A second install conflicts with the existing copy.
    try {
      await f.projects.install({ sources: [source], toolId: 'qoder', projectPath: f.project })
      assert.fail('应拒绝同名冲突')
    } catch (e) {
      assert.match((e as Error).message, /目标已存在同名 Skill/)
    }
    // Invalid tool and unscanned project are rejected.
    await assert.rejects(
      () => f.projects.install({ sources: [source], toolId: 'zcode', projectPath: f.project }),
      /不支持项目级安装/,
    )
    await assert.rejects(
      () =>
        f.projects.install({
          sources: [source],
          toolId: 'claude',
          projectPath: path.join(f.root, 'other-project'),
        }),
      /已变更|请先/,
    )
    await assert.rejects(
      () => f.projects.install({ sources: [source], toolId: 'claude', projectPath: '' }),
      /请先选择/,
    )
  } finally {
    await f.cleanup()
  }
})

test('scan rejects missing or invalid project paths', async () => {
  const f = await fixture()
  try {
    await assert.rejects(() => f.projects.scan(path.join(f.root, 'nope')), /不存在/)
    const filePath = path.join(f.root, 'plain.txt')
    await fs.writeFile(filePath, 'x')
    await assert.rejects(() => f.projects.scan(filePath), /文件夹/)
    await assert.rejects(() => f.projects.scan(''), /请选择/)
  } finally {
    await f.cleanup()
  }
})
