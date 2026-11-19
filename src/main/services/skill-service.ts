import { applyToolSettings, createToolRegistry } from '../adapters/tool-registry'
import { hashDirectory } from '../filesystem/hash-directory'
import { inspectSkill, discoverSkills } from './skill-parser'
import { getSkillDetail, readSkillFile, writeSkillFile } from './skill-browser'
import { renderSkillTemplate } from './skill-template'
import type { RecordEntry, LibraryEntry, TrashRecord } from '../storage/types'
import { writeJsonFile } from '../storage/json-file'
import { compatibilityKey, normalizeCompatibility, supportsTool } from '../../shared/compatibility'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Candidate,
  Compatibility,
  CreateSkillInput,
  Settings,
  Skill,
  SkillDetail,
  Snapshot,
  Tool,
  ToolId,
} from '../../shared/types'

/** Directory-name rules shared by template creation and import validation. */
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export class SkillStore {
  tools: Tool[]
  private records: RecordEntry[] = []
  private library: LibraryEntry[] = []
  private trash: TrashRecord[] = []
  private libraryRootOverride: string | undefined
  private get trashRoot() {
    return path.join(this.data, 'trash')
  }
  private trashPath(entry: TrashRecord) {
    return path.join(this.trashRoot, entry.id, entry.skill.name)
  }
  get defaultLibraryRoot() {
    return path.join(this.data, 'library')
  }
  get libraryRoot() {
    return this.libraryRootOverride ?? this.defaultLibraryRoot
  }
  private libraryPath(entry: LibraryEntry) {
    return path.join(this.libraryRoot, entry.id, entry.name)
  }
  constructor(
    private data: string,
    private home: string,
    settings?: Settings,
  ) {
    this.tools = createToolRegistry(home)
    this.applySettings(settings ?? { theme: 'system', tools: {} })
  }
  /**
   * Re-applies user settings to the live registry without recreating the
   * store, so enable/disable and scan-directory changes take effect at once.
   */
  applySettings(settings: Settings) {
    this.tools = applyToolSettings(createToolRegistry(this.home), settings.tools)
    this.libraryRootOverride = settings.libraryRoot ? path.resolve(settings.libraryRoot) : undefined
  }
  /**
   * Moves the whole central library to another location (or back to the
   * default) and remembers the override for this session. The destination
   * must be an empty or missing directory, never nested inside the source.
   */
  async setLibraryRoot(target: string | undefined) {
    const destination = target ? path.resolve(target) : this.defaultLibraryRoot
    const source = this.libraryRoot
    if (destination === source) {
      this.libraryRootOverride = target ? destination : undefined
      return
    }
    const nested =
      destination.startsWith(source + path.sep) || source.startsWith(destination + path.sep)
    if (nested) throw new Error('新仓库位置不能位于当前仓库内部（或包含当前仓库）')
    const existing = await fs.readdir(destination).catch((e) => {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      return null
    })
    if (existing?.length) throw new Error('目标目录不是空目录，请选择一个空文件夹')
    await fs.mkdir(destination, { recursive: true })
    try {
      for (const entry of await fs.readdir(source, { withFileTypes: true }))
        await this.moveDirectory(path.join(source, entry.name), path.join(destination, entry.name))
    } catch (error) {
      // Best-effort cleanup of a partially filled destination; the source stays intact.
      for (const name of existing ?? [])
        await fs.rm(path.join(destination, name), { recursive: true, force: true }).catch(() => {})
      throw error
    }
    if (source !== this.defaultLibraryRoot) await fs.rmdir(source).catch(() => {})
    this.libraryRootOverride = target ? destination : undefined
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
    await fs.mkdir(this.trashRoot, { recursive: true })
    for (const directory of await fs.readdir(this.trashRoot, { withFileTypes: true })) {
      if (!directory.isDirectory() || !/^[a-f0-9-]{36}$/.test(directory.name)) continue
      const entry: TrashRecord = JSON.parse(
        await fs.readFile(path.join(this.trashRoot, directory.name, 'entry.json'), 'utf8'),
      )
      if (entry.id !== directory.name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.skill.name))
        throw new Error('回收站记录格式错误')
      // A completed restore can leave only metadata if cleanup was interrupted.
      try {
        await fs.access(this.trashPath(entry))
        this.trash.push(entry)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    this.trash.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
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
  /**
   * Creates a ready-to-edit Skill scaffold from the built-in template, either
   * as a managed library entry or directly inside a tool's scan root. The
   * result must pass the same metadata checks applied to imported skills.
   */
  async createSkill(input: CreateSkillInput): Promise<Candidate> {
    const name = input.name.trim()
    if (!NAME_PATTERN.test(name) || RESERVED_NAME.test(name) || name.endsWith('.'))
      throw new Error('Skill 名称需使用字母、数字、短横线或下划线，且不能是系统保留名称')
    const description = input.description.trim()
    if (!description) throw new Error('请填写 Skill 描述')
    if (description.length > 1024)
      throw new Error('描述不能超过 1024 字符（ZCode 会忽略超限 Skill）')
    const content = renderSkillTemplate(name, description)
    if (input.target === 'library') {
      const compatibility = normalizeCompatibility(input.compatibility ?? 'all')
      if (
        this.library.some(
          (e) =>
            e.name.toLowerCase() === name.toLowerCase() &&
            compatibilityKey(e.compatibility) === compatibilityKey(compatibility),
        )
      )
        throw new Error(`仓库中已有同名、同适用范围的 Skill：${name}`)
      const entry: LibraryEntry = {
        id: randomUUID(),
        name,
        source: '',
        compatibility,
        addedAt: new Date().toISOString(),
      }
      const dir = this.libraryPath(entry)
      try {
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(path.join(dir, 'SKILL.md'), content)
        entry.source = dir
        this.library.push(entry)
        await this.saveLibrary()
      } catch (e) {
        this.library = this.library.filter((item) => item !== entry)
        await fs.rm(path.dirname(dir), { recursive: true, force: true }).catch(() => {})
        throw e
      }
      return { path: dir, name, metadataName: name, description, warnings: [] }
    }
    const tool = this.tools.find((t) => t.id === input.target)
    if (!tool) throw new Error('未找到目标工具')
    if (tool.id === 'opencode' && (name.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)))
      throw new Error('OpenCode 要求名称为不超过 64 字符的小写字母、数字及单短横线')
    const conflict = (await this.scan()).skills.find(
      (s) => s.discoveredBy?.includes(tool.id) && s.name.toLowerCase() === name.toLowerCase(),
    )
    if (conflict) throw new Error(`该工具已发现同名 Skill：${conflict.path}`)
    const dir = path.join(tool.root, name)
    try {
      await fs.mkdir(tool.root, { recursive: true })
      await fs.mkdir(dir)
      await fs.writeFile(path.join(dir, 'SKILL.md'), content)
    } catch (e) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
      throw e
    }
    return { path: dir, name, metadataName: name, description, warnings: [] }
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
  async deleteLibrary(id: string) {
    const entry = this.library.find((e) => e.id === id)
    if (!entry) throw new Error('仓库 Skill 已不存在')
    await this.recycle(await this.findSkill(id), { library: entry })
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
    return {
      tools: this.tools,
      skills,
      diagnostics,
      library,
      libraryRoot: this.libraryRoot,
      trash: this.trash.map(({ id, skill, deletedAt, originalPath }) => ({
        id,
        skill,
        deletedAt,
        originalPath,
      })),
    }
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
  async writeFile(id: string, relativePath: string, content: string): Promise<void> {
    return writeSkillFile(await this.findSkill(id), relativePath, content)
  }
  async prepareCopy(id: string): Promise<Candidate> {
    const skill = (await this.scan()).skills.find((s) => s.id === id)
    if (!skill) throw new Error('Skill 已不存在，请刷新列表')
    if (skill.linked) throw new Error('暂不复制链接目录，请通过本地导入选择其真实目录')
    return this.inspect(skill.path)
  }
  async deleteExternal(id: string) {
    const skill = (await this.scan()).skills.find((s) => s.id === id)
    if (!skill || skill.managed)
      throw new Error('仅支持删除扫描到的外部 Skill；应用管理的 Skill 请使用卸载')
    if ((await fs.lstat(skill.path)).isSymbolicLink())
      throw new Error('暂不删除链接目录，请在文件管理器中处理链接')
    await this.recycle(skill)
  }
  async uninstall(id: string) {
    const record = this.records.find((r) => r.id === id)
    if (!record) throw new Error('仅支持卸载本工具安装的 Skill')
    if ((await fs.lstat(record.path)).isSymbolicLink())
      throw new Error('安装目录已变为链接，停止卸载')
    await this.recycle(await this.findSkill(id), { installation: record })
  }
  private async moveDirectory(source: string, destination: string) {
    try {
      await fs.rename(source, destination)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
      const original = await this.hashes(source)
      try {
        await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false })
        const copied = await this.hashes(destination)
        if (JSON.stringify(original) !== JSON.stringify(copied))
          throw new Error('复制校验失败，原文件已保留', { cause: error })
      } catch (copyError) {
        await fs.rm(destination, { recursive: true, force: true })
        throw copyError
      }
      // Hide the source atomically on its own disk before cleaning up. A cleanup
      // failure leaves an extra hidden copy; the verified destination stays intact.
      const backup = path.join(path.dirname(source), `.trash-transfer-${randomUUID()}`)
      try {
        await fs.rename(source, backup)
      } catch (moveError) {
        await fs.rm(destination, { recursive: true, force: true })
        throw moveError
      }
      await fs.rm(backup, { recursive: true, force: true }).catch(() => {})
    }
  }
  private async recycle(
    skill: Skill,
    metadata: Partial<Pick<TrashRecord, 'library' | 'installation'>> = {},
  ) {
    await this.hashes(skill.path)
    const entry: TrashRecord = {
      id: randomUUID(),
      skill,
      originalPath: skill.path,
      deletedAt: new Date().toISOString(),
      ...metadata,
    }
    const destination = this.trashPath(entry)
    await fs.mkdir(path.dirname(destination))
    try {
      await writeJsonFile(path.join(path.dirname(destination), 'entry.json'), entry)
      await this.moveDirectory(skill.path, destination)
    } catch (error) {
      await fs.rm(path.dirname(destination), { recursive: true, force: true })
      throw error
    }
    const previousRecords = this.records,
      previousLibrary = this.library
    this.records = this.records.filter((record) => record.id !== metadata.installation?.id)
    this.library = this.library.filter((item) => item.id !== metadata.library?.id)
    try {
      if (metadata.installation) await this.save()
      if (metadata.library) await this.saveLibrary()
    } catch (error) {
      this.records = previousRecords
      this.library = previousLibrary
      await this.moveDirectory(destination, skill.path)
      await fs.rm(path.dirname(destination), { recursive: true, force: true })
      throw error
    }
    this.trash.unshift(entry)
  }
  async restoreTrash(id: string) {
    const entry = this.trash.find((item) => item.id === id)
    if (!entry) throw new Error('回收站项目已不存在')
    if (
      entry.library &&
      this.library.some(
        (item) =>
          item.name.toLowerCase() === entry.library!.name.toLowerCase() &&
          compatibilityKey(item.compatibility) === compatibilityKey(entry.library!.compatibility),
      )
    )
      throw new Error('仓库已有同名、同适用范围的 Skill，无法还原')
    try {
      await fs.lstat(entry.originalPath)
      throw new Error('原位置已有同名目录，无法还原，请先处理冲突')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await fs.mkdir(path.dirname(entry.originalPath), { recursive: true })
    await fs.mkdir(entry.originalPath)
    try {
      const source = this.trashPath(entry)
      // Keep the recoverable copy until both content and management records are restored.
      const original = await this.hashes(source)
      for (const name of await fs.readdir(source))
        await fs.cp(path.join(source, name), path.join(entry.originalPath, name), {
          recursive: true,
          errorOnExist: true,
          force: false,
        })
      const restored = await this.hashes(entry.originalPath)
      if (JSON.stringify(original) !== JSON.stringify(restored))
        throw new Error('还原校验失败，回收站副本已保留')
    } catch (error) {
      await fs.rm(entry.originalPath, { recursive: true, force: true })
      throw error
    }
    const previousRecords = this.records,
      previousLibrary = this.library
    try {
      if (entry.installation) {
        this.records = [...this.records, entry.installation]
        await this.save()
      }
      if (entry.library) {
        this.library = [...this.library, entry.library]
        await this.saveLibrary()
      }
    } catch (error) {
      this.records = previousRecords
      this.library = previousLibrary
      await fs.rm(entry.originalPath, { recursive: true, force: true })
      throw error
    }
    await fs.rm(path.dirname(this.trashPath(entry)), { recursive: true })
    this.trash = this.trash.filter((item) => item.id !== id)
  }
  async deleteTrash(id: string) {
    const entry = this.trash.find((item) => item.id === id)
    if (!entry) throw new Error('回收站项目已不存在')
    await fs.rm(path.dirname(this.trashPath(entry)), { recursive: true })
    this.trash = this.trash.filter((item) => item.id !== id)
  }
}
