import { createToolRegistry } from '../adapters/tool-registry'
import { hashDirectory } from '../filesystem/hash-directory'
import { inspectSkill, discoverSkills } from './skill-parser'
import { getSkillDetail, readSkillFile } from './skill-browser'
import type { RecordEntry, LibraryEntry } from '../storage/types'
import { writeJsonFile } from '../storage/json-file'
import { compatibilityKey, normalizeCompatibility, supportsTool } from '../../shared/compatibility'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Candidate,
  Compatibility,
  Skill,
  SkillDetail,
  Snapshot,
  Tool,
  ToolId,
} from '../../shared/types'

export class SkillStore {
  tools: Tool[]
  private records: RecordEntry[] = []
  private library: LibraryEntry[] = []
  get libraryRoot() {
    return path.join(this.data, 'library')
  }
  private libraryPath(entry: LibraryEntry) {
    return path.join(this.libraryRoot, entry.id, entry.name)
  }
  constructor(
    private data: string,
    home: string,
  ) {
    this.tools = createToolRegistry(home)
  }
  async init() {
    await fs.mkdir(this.data, { recursive: true })
    try {
      this.records = JSON.parse(
        await fs.readFile(path.join(this.data, 'installations.json'), 'utf8'),
      )
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('安装记录读取失败，请先检查 installations.json，避免丢失管理记录。', {
          cause: e,
        })
    }
    if (!Array.isArray(this.records)) throw new Error('安装记录格式错误')
    try {
      this.library = JSON.parse(await fs.readFile(path.join(this.data, 'library.json'), 'utf8'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('中央仓库记录读取失败', { cause: e })
    }
    if (
      !Array.isArray(this.library) ||
      this.library.some(
        (e) => !e || !/^[a-f0-9-]{36}$/.test(e.id) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(e.name),
      )
    )
      throw new Error('中央仓库记录格式错误')
    this.library = this.library.map((entry) => ({
      ...entry,
      compatibility: normalizeCompatibility(entry.compatibility),
    }))
    await fs.mkdir(this.libraryRoot, { recursive: true })
  }
  private async saveLibrary() {
    await writeJsonFile(path.join(this.data, 'library.json'), this.library)
  }
  async addToLibrary(sources: { path: string; source: string }[], compatibility: Compatibility) {
    compatibility = normalizeCompatibility(compatibility)
    if (!sources.length || sources.length > 200) throw new Error('请选择 1 至 200 个 Skill')
    const added: LibraryEntry[] = []
    try {
      for (const source of sources) {
        const candidate = await this.inspect(source.path)
        if (
          this.library.some(
            (e) =>
              e.name.toLowerCase() === candidate.name.toLowerCase() &&
              compatibilityKey(e.compatibility) === compatibilityKey(compatibility),
          ) ||
          added.some((e) => e.name === candidate.name)
        )
          throw new Error(`仓库中已有同名、同适用范围的 Skill：${candidate.name}`)
        if ((await fs.lstat(source.path)).isSymbolicLink())
          throw new Error('请导入 Skill 的真实目录')
        await this.hashes(source.path)
        const entry: LibraryEntry = {
          id: randomUUID(),
          name: candidate.name,
          source: source.source,
          compatibility,
          addedAt: new Date().toISOString(),
        }
        added.push(entry)
        await fs.cp(source.path, this.libraryPath(entry), { recursive: true, dereference: false })
        await this.hashes(this.libraryPath(entry))
      }
      this.library.push(...added)
      await this.saveLibrary()
    } catch (e) {
      this.library = this.library.filter((item) => !added.includes(item))
      for (const item of added)
        await fs.rm(path.dirname(this.libraryPath(item)), { recursive: true, force: true })
      throw e
    }
  }
  async collectSkill(id: string, compatibility: Compatibility) {
    const candidate = await this.prepareCopy(id)
    await this.addToLibrary([{ path: candidate.path, source: candidate.path }], compatibility)
  }
  async setCompatibility(id: string, compatibility: Compatibility) {
    compatibility = normalizeCompatibility(compatibility)
    const entry = this.library.find((e) => e.id === id)
    if (!entry) throw new Error('仓库 Skill 已不存在')
    if (
      this.library.some(
        (e) =>
          e.id !== id &&
          e.name.toLowerCase() === entry.name.toLowerCase() &&
          compatibilityKey(e.compatibility) === compatibilityKey(compatibility),
      )
    )
      throw new Error('同名、同适用范围的 Skill 已存在')
    const previous = entry.compatibility
    entry.compatibility = compatibility
    try {
      await this.saveLibrary()
    } catch (e) {
      entry.compatibility = previous
      throw e
    }
  }
  async deleteLibrary(id: string, trash: (directory: string) => Promise<void>) {
    const entry = this.library.find((e) => e.id === id)
    if (!entry) throw new Error('仓库 Skill 已不存在')
    const previous = this.library
    this.library = this.library.filter((e) => e.id !== id)
    try {
      await this.saveLibrary()
    } catch (e) {
      this.library = previous
      throw e
    }
    try {
      await trash(path.dirname(this.libraryPath(entry)))
    } catch (e) {
      this.library = previous
      await this.saveLibrary()
      throw e
    }
  }
  async installLibrary(ids: string[], toolIds: ToolId[]) {
    if (!ids.length || new Set(ids).size !== ids.length || ids.length > 200)
      throw new Error('请选择有效的仓库 Skill')
    const entries = ids.map((id) => {
      const entry = this.library.find((e) => e.id === id)
      if (!entry) throw new Error('仓库 Skill 已不存在，请刷新')
      if (toolIds.some((t) => !supportsTool(entry.compatibility, t)))
        throw new Error(`${entry.name} 已标记为工具专用，请选择对应工具或修改适用范围`)
      return entry
    })
    const previous = [...this.records]
    try {
      for (const entry of entries)
        await this.install(this.libraryPath(entry), toolIds, entry.source, entry.id)
    } catch (e) {
      const added = this.records.filter((r) => !previous.some((p) => p.id === r.id))
      this.records = previous
      await this.save()
      for (const record of added) await fs.rm(record.path, { recursive: true, force: true })
      throw e
    }
  }
  private async save() {
    await writeJsonFile(path.join(this.data, 'installations.json'), this.records)
  }
  inspect = inspectSkill
  discover = discoverSkills
  private hashes = hashDirectory
  async scan(): Promise<Snapshot> {
    const skills: Skill[] = [],
      diagnostics: string[] = []
    // Scan each physical root once; shared files retain one ID and one management record.
    const roots = [...new Set(this.tools.flatMap((tool) => tool.discoveryRoots))]
    for (const root of roots) {
      const readers = this.tools.filter((tool) => tool.discoveryRoots.includes(root))
      const owner = this.tools.find((tool) => tool.root === root) ?? readers[0]
      let entries
      try {
        entries = await fs.readdir(root, { withFileTypes: true })
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
          diagnostics.push(`${root}：${(e as Error).message}`)
        continue
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink()))
          continue
        const dir = path.join(root, entry.name)
        try {
          const candidate = await this.inspect(dir)
          const record = this.records.find((r) => r.path === dir)
          skills.push({
            ...candidate,
            id: record?.id ?? `${owner.id}:${dir}`,
            toolId: record?.toolId ?? owner.id,
            managed: !!record,
            linked: entry.isSymbolicLink(),
            source: record?.source,
            libraryId: record?.libraryId,
            discoveredBy: readers.map((tool) => tool.id),
            installedBy: record?.toolId,
          })
        } catch (e) {
          diagnostics.push(`${root} / ${entry.name}：${(e as Error).message}`)
        }
      }
    }
    const library: Skill[] = []
    for (const entry of this.library) {
      try {
        library.push({
          ...(await this.inspect(this.libraryPath(entry))),
          id: entry.id,
          toolId: 'library',
          managed: true,
          linked: false,
          compatibility: entry.compatibility,
          source: entry.source,
          addedAt: entry.addedAt,
        })
      } catch (e) {
        diagnostics.push(`中央仓库 / ${entry.name}：${(e as Error).message}`)
      }
    }
    return { tools: this.tools, skills, diagnostics, library, libraryRoot: this.libraryRoot }
  }
  async install(source: string, ids: ToolId[], provenance = source, libraryId?: string) {
    const candidate = await this.inspect(source)
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !this.tools.some((t) => t.id === id))
    )
      throw new Error('请选择有效的目标工具')
    if (ids.includes('zcode') && candidate.description.length > 1024)
      throw new Error('ZCode 描述不能超过 1024 字符')
    if (ids.includes('opencode')) {
      if (
        candidate.name.length > 64 ||
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(candidate.name) ||
        candidate.metadataName !== candidate.name
      )
        throw new Error(
          'OpenCode 要求目录名与 name 一致，且为不超过 64 字符的小写字母、数字及单短横线',
        )
      if (candidate.description.length > 1024) throw new Error('OpenCode 描述不能超过 1024 字符')
    }
    const existing = (await this.scan()).skills
    for (const id of ids) {
      const conflict = existing.find(
        (skill) =>
          skill.discoveredBy?.includes(id) &&
          skill.name.toLowerCase() === candidate.name.toLowerCase(),
      )
      if (conflict)
        throw new Error(
          `目标已存在或可从共享 / 兼容目录发现同名 Skill：${conflict.path}。请先处理已有 Skill。`,
        )
    }
    await this.hashes(source)
    const destinations = ids.map((id) => ({
      tool: this.tools.find((t) => t.id === id)!,
      dest: path.join(this.tools.find((t) => t.id === id)!.root, candidate.name),
    }))
    for (const { dest } of destinations) {
      try {
        await fs.lstat(dest)
        throw new Error(`目标已存在：${dest}。为避免覆盖，请先处理已有 Skill。`)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
    }
    const added: RecordEntry[] = []
    const stages: string[] = []
    try {
      for (const { tool, dest } of destinations) {
        await fs.mkdir(tool.root, { recursive: true })
        const stage = path.join(tool.root, `.install-${randomUUID()}`)
        stages.push(stage)
        await fs.cp(source, stage, { recursive: true, dereference: false })
        const hashes = await this.hashes(stage)
        // mkdir reserves the destination without replacing an existing directory.
        await fs.mkdir(dest)
        added.push({
          id: randomUUID(),
          toolId: tool.id,
          path: dest,
          source: provenance,
          hashes,
          libraryId,
        })
        for (const file of await fs.readdir(stage))
          await fs.rename(path.join(stage, file), path.join(dest, file))
      }
      this.records.push(...added)
      await this.save()
    } catch (e) {
      this.records = this.records.filter((r) => !added.includes(r))
      for (const record of added) await fs.rm(record.path, { recursive: true, force: true })
      throw e
    } finally {
      for (const stage of stages) await fs.rm(stage, { recursive: true, force: true })
    }
  }
  private async findSkill(id: string) {
    const snapshot = await this.scan()
    const skill = [...snapshot.skills, ...snapshot.library].find((s) => s.id === id)
    if (!skill) throw new Error('Skill 已不存在，请刷新列表')
    return skill
  }
  async detail(id: string): Promise<SkillDetail> {
    return getSkillDetail(await this.findSkill(id))
  }
  async readFile(id: string, relativePath: string): Promise<string> {
    return readSkillFile(await this.findSkill(id), relativePath)
  }
  async prepareCopy(id: string): Promise<Candidate> {
    const skill = (await this.scan()).skills.find((s) => s.id === id)
    if (!skill) throw new Error('Skill 已不存在，请刷新列表')
    if (skill.linked) throw new Error('暂不复制链接目录，请通过本地导入选择其真实目录')
    return this.inspect(skill.path)
  }
  async deleteExternal(id: string, trash: (directory: string) => Promise<void>) {
    const skill = (await this.scan()).skills.find((s) => s.id === id)
    if (!skill || skill.managed)
      throw new Error('仅支持删除扫描到的外部 Skill；应用管理的 Skill 请使用卸载')
    if ((await fs.lstat(skill.path)).isSymbolicLink())
      throw new Error('暂不删除链接目录，请在文件管理器中处理链接')
    await trash(skill.path)
  }
  async uninstall(id: string) {
    const record = this.records.find((r) => r.id === id)
    if (!record) throw new Error('仅支持卸载本工具安装的 Skill')
    if ((await fs.lstat(record.path)).isSymbolicLink())
      throw new Error('安装目录已变为链接，停止卸载')
    const current = await this.hashes(record.path)
    const keys = Object.keys(current).sort(),
      original = Object.keys(record.hashes).sort()
    if (
      JSON.stringify(keys) !== JSON.stringify(original) ||
      keys.some((k) => current[k] !== record.hashes[k])
    )
      throw new Error('检测到文件被修改或新增。请先备份并手动处理，已停止卸载。')
    const backup = path.join(path.dirname(record.path), `.removed-${randomUUID()}`)
    await fs.rename(record.path, backup)
    const previous = this.records
    this.records = this.records.filter((r) => r.id !== id)
    try {
      await this.save()
    } catch (e) {
      this.records = previous
      await fs.rename(backup, record.path)
      throw e
    }
    // Keep a recoverable copy; it is hidden from target-tool discovery.
  }
}
