import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { parseDocument } from 'yaml'
import type { Candidate, Compatibility, Skill, SkillDetail, Snapshot, Tool, ToolId } from '../shared/types'

interface RecordEntry { id: string; toolId: ToolId; path: string; source: string; hashes: Record<string, string>; libraryId?: string }
interface LibraryEntry { id: string; name: string; source: string; compatibility: Compatibility; addedAt: string }
export class SkillStore {
  tools: Tool[]
  private records: RecordEntry[] = []
  private library: LibraryEntry[] = []
  get libraryRoot() { return path.join(this.data, 'library') }
  private libraryPath(entry: LibraryEntry) { return path.join(this.libraryRoot, entry.id, entry.name) }
  constructor(private data: string, home: string) {
    this.tools = [
      { id: 'claude', name: 'Claude Code', root: path.join(home, '.claude', 'skills') },
      { id: 'codex', name: 'Codex', root: path.join(home, '.agents', 'skills') },
      { id: 'zcode', name: 'ZCode', root: path.join(home, '.zcode', 'skills') }
    ]
  }
  async init() {
    await fs.mkdir(this.data, { recursive: true })
    try { this.records = JSON.parse(await fs.readFile(path.join(this.data, 'installations.json'), 'utf8')) }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('安装记录读取失败，请先检查 installations.json，避免丢失管理记录。') }
    if (!Array.isArray(this.records)) throw new Error('安装记录格式错误')
    try { this.library = JSON.parse(await fs.readFile(path.join(this.data, 'library.json'), 'utf8')) }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('中央仓库记录读取失败') }
    if (!Array.isArray(this.library) || this.library.some(e => !e || !/^[a-f0-9-]{36}$/.test(e.id) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(e.name) || !['all', 'claude', 'codex', 'zcode'].includes(e.compatibility))) throw new Error('中央仓库记录格式错误')
    await fs.mkdir(this.libraryRoot, { recursive: true })
  }
  private async saveLibrary() {
    const temp = path.join(this.data, 'library.tmp')
    await fs.writeFile(temp, JSON.stringify(this.library, null, 2))
    await fs.rename(temp, path.join(this.data, 'library.json'))
  }
  private validateCompatibility(value: Compatibility) {
    if (!['all', 'claude', 'codex', 'zcode'].includes(value)) throw new Error('无效的适用工具')
  }
  async addToLibrary(sources: { path: string; source: string }[], compatibility: Compatibility) {
    this.validateCompatibility(compatibility)
    if (!sources.length || sources.length > 200) throw new Error('请选择 1 至 200 个 Skill')
    const added: LibraryEntry[] = []
    try {
      for (const source of sources) {
        const candidate = await this.inspect(source.path)
        if (this.library.some(e => e.name === candidate.name && e.compatibility === compatibility) || added.some(e => e.name === candidate.name)) throw new Error(`仓库中已有同名、同适用范围的 Skill：${candidate.name}`)
        if ((await fs.lstat(source.path)).isSymbolicLink()) throw new Error('请导入 Skill 的真实目录')
        await this.hashes(source.path)
        const entry: LibraryEntry = { id: randomUUID(), name: candidate.name, source: source.source, compatibility, addedAt: new Date().toISOString() }
        added.push(entry)
        await fs.cp(source.path, this.libraryPath(entry), { recursive: true, dereference: false })
        await this.hashes(this.libraryPath(entry))
      }
      this.library.push(...added)
      await this.saveLibrary()
    } catch (e) {
      this.library = this.library.filter(item => !added.includes(item))
      for (const item of added) await fs.rm(path.dirname(this.libraryPath(item)), { recursive: true, force: true })
      throw e
    }
  }
  async collectSkill(id: string, compatibility: Compatibility) {
    const candidate = await this.prepareCopy(id)
    await this.addToLibrary([{ path: candidate.path, source: candidate.path }], compatibility)
  }
  async setCompatibility(id: string, compatibility: Compatibility) {
    this.validateCompatibility(compatibility)
    const entry = this.library.find(e => e.id === id)
    if (!entry) throw new Error('仓库 Skill 已不存在')
    if (this.library.some(e => e.id !== id && e.name === entry.name && e.compatibility === compatibility)) throw new Error('同名、同适用范围的 Skill 已存在')
    const previous = entry.compatibility
    entry.compatibility = compatibility
    try { await this.saveLibrary() } catch (e) { entry.compatibility = previous; throw e }
  }
  async deleteLibrary(id: string, trash: (directory: string) => Promise<void>) {
    const entry = this.library.find(e => e.id === id)
    if (!entry) throw new Error('仓库 Skill 已不存在')
    const previous = this.library
    this.library = this.library.filter(e => e.id !== id)
    try { await this.saveLibrary() } catch (e) { this.library = previous; throw e }
    try { await trash(path.dirname(this.libraryPath(entry))) }
    catch (e) { this.library = previous; await this.saveLibrary(); throw e }
  }
  async installLibrary(ids: string[], toolIds: ToolId[]) {
    if (!ids.length || new Set(ids).size !== ids.length || ids.length > 200) throw new Error('请选择有效的仓库 Skill')
    const entries = ids.map(id => {
      const entry = this.library.find(e => e.id === id)
      if (!entry) throw new Error('仓库 Skill 已不存在，请刷新')
      if (entry.compatibility !== 'all' && toolIds.some(t => t !== entry.compatibility)) throw new Error(`${entry.name} 已标记为工具专用，请选择对应工具或修改适用范围`)
      return entry
    })
    const previous = [...this.records]
    try {
      for (const entry of entries) await this.install(this.libraryPath(entry), toolIds, entry.source, entry.id)
    } catch (e) {
      const added = this.records.filter(r => !previous.some(p => p.id === r.id))
      this.records = previous
      await this.save()
      for (const record of added) await fs.rm(record.path, { recursive: true, force: true })
      throw e
    }
  }
  private async save() {
    const temp = path.join(this.data, 'installations.tmp')
    await fs.writeFile(temp, JSON.stringify(this.records, null, 2))
    await fs.rename(temp, path.join(this.data, 'installations.json'))
  }
  async inspect(dir: string): Promise<Candidate> {
    const text = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')
    const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    if (!match) throw new Error(`${path.basename(dir)}：缺少 YAML frontmatter`)
    const document = parseDocument(match[1], { uniqueKeys: true })
    if (document.errors.length) throw new Error(`${path.basename(dir)}：YAML 格式错误`)
    const metadata = document.toJS({ maxAliasCount: 50 })
    if (typeof metadata?.name !== 'string' || !metadata.name.trim() || typeof metadata?.description !== 'string' || !metadata.description.trim()) throw new Error(`${path.basename(dir)}：name 和 description 必须是非空字符串`)
    const name = path.basename(dir)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name.endsWith('.')) throw new Error('Skill 目录名需使用字母、数字、短横线或下划线，且不能是系统保留名称')
    const warnings: string[] = []
    if (metadata.name !== name) warnings.push(`文件夹名「${name}」与 SKILL.md 中的 name「${metadata.name}」不同。建议统一命名；本应用按文件夹名安装，不会自动改写文件。`)
    if (metadata.description.length > 1024) warnings.push('描述超过 1024 字符，ZCode 将忽略此 Skill')
    if (Buffer.byteLength(text.slice(match[0].length)) > 100 * 1024) warnings.push('正文超过 100KB，ZCode 可能截断加载')
    return { path: dir, name, description: metadata.description, warnings }
  }
  async discover(root: string): Promise<Candidate[]> {
    const found: Candidate[] = []
    const walk = async (dir: string, depth: number) => {
      if (found.length >= 200) throw new Error('一次最多导入 200 个 Skill')
      try { await fs.access(path.join(dir, 'SKILL.md')); found.push(await this.inspect(dir)); return }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
      if (depth >= 4) return
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') await walk(path.join(dir, entry.name), depth + 1)
      }
    }
    await walk(root, 0)
    return found
  }
  private async hashes(dir: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    const walk = async (current: string) => {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name)
        const stat = await fs.lstat(full)
        if (stat.isSymbolicLink()) throw new Error('Skill 内含符号链接，请改用完整的普通文件目录')
        if (stat.isDirectory()) await walk(full)
        else if (stat.isFile()) result[path.relative(dir, full)] = createHash('sha256').update(await fs.readFile(full)).digest('hex')
        else throw new Error('Skill 中存在不支持的文件类型')
      }
    }
    await walk(dir)
    return result
  }
  async scan(): Promise<Snapshot> {
    const skills: Skill[] = [], diagnostics: string[] = []
    for (const tool of this.tools) {
      let entries
      try { entries = await fs.readdir(tool.root, { withFileTypes: true }) }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') diagnostics.push(`${tool.name}：${(e as Error).message}`); continue }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
        const dir = path.join(tool.root, entry.name)
        try {
          const candidate = await this.inspect(dir)
          const record = this.records.find(r => r.path === dir)
          skills.push({ ...candidate, id: record?.id ?? `${tool.id}:${entry.name}`, toolId: tool.id, managed: !!record, linked: entry.isSymbolicLink(), source: record?.source, libraryId: record?.libraryId })
        } catch (e) { diagnostics.push(`${tool.name} / ${entry.name}：${(e as Error).message}`) }
      }
    }
    const library: Skill[] = []
    for (const entry of this.library) {
      try { library.push({ ...await this.inspect(this.libraryPath(entry)), id: entry.id, toolId: 'library', managed: true, linked: false, compatibility: entry.compatibility, source: entry.source, addedAt: entry.addedAt }) }
      catch (e) { diagnostics.push(`中央仓库 / ${entry.name}：${(e as Error).message}`) }
    }
    return { tools: this.tools, skills, diagnostics, library, libraryRoot: this.libraryRoot }
  }
  async install(source: string, ids: ToolId[], provenance = source, libraryId?: string) {
    const candidate = await this.inspect(source)
    if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !this.tools.some(t => t.id === id))) throw new Error('请选择有效的目标工具')
    if (ids.includes('zcode') && candidate.description.length > 1024) throw new Error('ZCode 描述不能超过 1024 字符')
    await this.hashes(source)
    const destinations = ids.map(id => ({ tool: this.tools.find(t => t.id === id)!, dest: path.join(this.tools.find(t => t.id === id)!.root, candidate.name) }))
    for (const { dest } of destinations) {
      try { await fs.lstat(dest); throw new Error(`目标已存在：${dest}。为避免覆盖，请先处理已有 Skill。`) }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
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
        added.push({ id: randomUUID(), toolId: tool.id, path: dest, source: provenance, hashes, libraryId })
        for (const file of await fs.readdir(stage)) await fs.rename(path.join(stage, file), path.join(dest, file))
      }
      this.records.push(...added)
      await this.save()
    } catch (e) {
      this.records = this.records.filter(r => !added.includes(r))
      for (const record of added) await fs.rm(record.path, { recursive: true, force: true })
      throw e
    } finally { for (const stage of stages) await fs.rm(stage, { recursive: true, force: true }) }
  }
  private async findSkill(id: string) {
    const snapshot = await this.scan()
    const skill = [...snapshot.skills, ...snapshot.library].find(s => s.id === id)
    if (!skill) throw new Error('Skill 已不存在，请刷新列表')
    return skill
  }
  async detail(id: string): Promise<SkillDetail> {
    const skill = await this.findSkill(id)
    const root = await fs.realpath(skill.path)
    const files: SkillDetail['files'] = []
    let truncated = false, visited = 0
    const walk = async (directory: string, depth: number) => {
      const entries = await fs.readdir(directory, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (++visited > 1000) { truncated = true; return }
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        const full = path.join(directory, entry.name)
        const stat = await fs.lstat(full)
        if (stat.isSymbolicLink()) continue
        if (stat.isDirectory()) {
          if (depth < 8) await walk(full, depth + 1)
          else truncated = true
        } else if (stat.isFile()) files.push({ path: path.relative(root, full).split(path.sep).join('/'), size: stat.size })
        if (visited > 1000) return
      }
    }
    await walk(root, 0)
    files.sort((a, b) => a.path === 'SKILL.md' ? -1 : b.path === 'SKILL.md' ? 1 : a.path.localeCompare(b.path))
    return { skill, files, truncated }
  }
  async readFile(id: string, relativePath: string): Promise<string> {
    if (!relativePath || relativePath.length > 2048 || relativePath.includes('\\') || relativePath.includes(':') || relativePath.includes('\0') || path.isAbsolute(relativePath) || relativePath.split('/').some(p => p === '..' || p === '.' || !p)) throw new Error('无效文件路径')
    const skill = await this.findSkill(id)
    const root = await fs.realpath(skill.path)
    const target = await fs.realpath(path.join(root, relativePath))
    const within = path.relative(root, target)
    if (!within || within.startsWith('..' + path.sep) || within === '..' || path.isAbsolute(within)) throw new Error('不允许浏览 Skill 目录之外的文件')
    const handle = await fs.open(target, 'r')
    try {
      const stat = await handle.stat()
      if (!stat.isFile()) throw new Error('只能查看普通文件')
      const limit = 1024 * 1024
      if (stat.size > limit) throw new Error('文件超过 1MB，请使用“打开目录”在外部查看')
      const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const bytes = buffer.subarray(0, bytesRead)
      if (bytesRead > limit) throw new Error('文件超过 1MB，请在外部查看')
      if (bytes.includes(0)) throw new Error('此文件为二进制文件，暂不支持预览')
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { throw new Error('暂不支持此文件编码，请在外部查看') }
    } finally { await handle.close() }
  }
  async prepareCopy(id: string): Promise<Candidate> {
    const skill = (await this.scan()).skills.find(s => s.id === id)
    if (!skill) throw new Error('Skill 已不存在，请刷新列表')
    if (skill.linked) throw new Error('暂不复制链接目录，请通过本地导入选择其真实目录')
    return this.inspect(skill.path)
  }
  async deleteExternal(id: string, trash: (directory: string) => Promise<void>) {
    const skill = (await this.scan()).skills.find(s => s.id === id)
    if (!skill || skill.managed) throw new Error('仅支持删除扫描到的外部 Skill；应用管理的 Skill 请使用卸载')
    if ((await fs.lstat(skill.path)).isSymbolicLink()) throw new Error('暂不删除链接目录，请在文件管理器中处理链接')
    await trash(skill.path)
  }
  async uninstall(id: string) {
    const record = this.records.find(r => r.id === id)
    if (!record) throw new Error('仅支持卸载本工具安装的 Skill')
    if ((await fs.lstat(record.path)).isSymbolicLink()) throw new Error('安装目录已变为链接，停止卸载')
    const current = await this.hashes(record.path)
    const keys = Object.keys(current).sort(), original = Object.keys(record.hashes).sort()
    if (JSON.stringify(keys) !== JSON.stringify(original) || keys.some(k => current[k] !== record.hashes[k])) throw new Error('检测到文件被修改或新增。请先备份并手动处理，已停止卸载。')
    const backup = path.join(path.dirname(record.path), `.removed-${randomUUID()}`)
    await fs.rename(record.path, backup)
    const previous = this.records
    this.records = this.records.filter(r => r.id !== id)
    try { await this.save() } catch (e) { this.records = previous; await fs.rename(backup, record.path); throw e }
    // Keep a recoverable copy; it is hidden from target-tool discovery.
  }
}
