import fs from 'node:fs/promises'
import path from 'node:path'
import { PROJECT_TOOLS } from '../adapters/project-paths'
import { discoverSkills } from './skill-parser'
import { getSkillDetail, readSkillFile, writeSkillFile } from './skill-browser'
import type { Compatibility, ProjectScan, Skill, SkillDetail } from '../../shared/types'

/**
 * Manages a temporarily selected project: scans the Agent skill directories
 * inside it and operates on those skills by absolute path. The project itself
 * is never persisted; only the recycle bin survives the session.
 */
export class ProjectService {
  private last: ProjectScan | undefined
  constructor(
    private readonly registerSource: (path: string, source: string) => void,
    private readonly resolveLink: (absPath: string) => { managed: boolean; libraryId?: string },
    private readonly collect: (
      absPath: string,
      toolId: Exclude<Skill['toolId'], 'library'>,
      compatibility: Compatibility,
    ) => Promise<void>,
    private readonly sync: (skill: Skill) => Promise<void>,
  ) {}

  async scan(projectPath: unknown): Promise<ProjectScan> {
    if (typeof projectPath !== 'string' || !projectPath.trim()) throw new Error('请选择项目文件夹')
    const root = path.resolve(projectPath)
    const stat = await fs.stat(root).catch(() => {
      throw new Error('项目文件夹不存在')
    })
    if (!stat.isDirectory()) throw new Error('请选择一个文件夹作为项目根目录')
    const tools: ProjectScan['tools'] = []
    const diagnostics: string[] = []
    for (const { toolId, name, relative } of PROJECT_TOOLS) {
      const directory = path.join(root, relative)
      const skills: Skill[] = []
      try {
        for (const candidate of await discoverSkills(directory)) {
          const abs = path.join(directory, candidate.name)
          const link = this.resolveLink(abs)
          skills.push({
            ...candidate,
            id: `${toolId}:${abs}`,
            path: abs,
            toolId,
            managed: link.managed,
            linked: false,
            libraryId: link.libraryId,
          })
          // Register so later browse/collect/install calls pass source validation.
          this.registerSource(abs, abs)
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
          diagnostics.push(`${directory}：${(e as Error).message}`)
      }
      tools.push({ toolId, name, directory, skills })
    }
    const scan: ProjectScan = { projectPath: root, tools, diagnostics }
    this.last = scan
    return scan
  }

  private current(): ProjectScan {
    if (!this.last) throw new Error('请先在项目页面选择项目文件夹')
    return this.last
  }

  /** Returns the registered skill for an absolute path from the last scan. */
  private registered(absPath: unknown): Skill {
    if (typeof absPath !== 'string' || !absPath.trim()) throw new Error('无效的 Skill 路径')
    const scan = this.current()
    const resolved = path.resolve(absPath)
    for (const tool of scan.tools)
      for (const skill of tool.skills)
        if (skill.path === resolved) return { ...skill, toolId: tool.toolId }
    throw new Error('Skill 已不在扫描结果中，请重新选择项目文件夹')
  }

  async collectSkill(absPath: unknown, compatibility: Compatibility): Promise<void> {
    const skill = this.registered(absPath)
    if (skill.toolId === 'library') throw new Error('无效的工具归属')
    await this.collect(skill.path, skill.toolId, compatibility)
  }

  syncToLibrary(absPath: unknown): Promise<void> {
    return this.sync(this.registered(absPath))
  }

  browse(absPath: unknown): Promise<SkillDetail> {
    return getSkillDetail(this.registered(absPath))
  }

  readFile(absPath: unknown, relativePath: unknown): Promise<string> {
    if (typeof relativePath !== 'string') throw new Error('无效文件请求')
    return readSkillFile(this.registered(absPath), relativePath)
  }

  writeFile(absPath: unknown, relativePath: unknown, content: unknown): Promise<void> {
    if (typeof relativePath !== 'string' || typeof content !== 'string')
      throw new Error('无效文件请求')
    return writeSkillFile(this.registered(absPath), relativePath, content)
  }

  /**
   * Copies library/project skills into one of the project's Agent directories.
   * Project installs are unmanaged copies: no records, no hashes, plain
   * rollback (remove what was created) when any destination conflicts.
   */
  async install(input: unknown): Promise<string[]> {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('无效的安装请求')
    const { sources, toolId, projectPath } = input as Record<string, unknown>
    if (!Array.isArray(sources) || !sources.length || sources.some((s) => typeof s !== 'string'))
      throw new Error('请选择要安装的 Skill')
    if (!PROJECT_TOOLS.some((t) => t.toolId === toolId)) throw new Error('该工具不支持项目级安装')
    if (typeof projectPath !== 'string' || !projectPath.trim())
      throw new Error('请先选择项目文件夹')
    const scan = this.current()
    if (path.resolve(projectPath) !== scan.projectPath)
      throw new Error('项目文件夹已变更，请重新选择项目')
    const projectTool = PROJECT_TOOLS.find((t) => t.toolId === toolId)!
    const targetRoot = path.join(scan.projectPath, projectTool.relative)
    // Check the whole batch before copying a single file.
    const destinations: { source: string; dest: string }[] = []
    for (const source of sources) {
      const resolvedSource = path.resolve(source)
      const owner = scan.tools.find((tool) =>
        tool.skills.some((skill) => skill.path === resolvedSource),
      )
      const local = owner?.skills.find((skill) => skill.path === resolvedSource)
      const candidate =
        local ??
        (await discoverSkills(path.dirname(resolvedSource))).find(
          (c) => path.join(path.dirname(resolvedSource), c.name) === resolvedSource,
        )
      if (!candidate) throw new Error(`Skill 已不存在：${resolvedSource}`)
      const dest = path.join(targetRoot, candidate.name)
      try {
        await fs.lstat(dest)
        throw new Error(`目标已存在同名 Skill：${dest}。为避免覆盖，请先处理已有 Skill。`)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
      destinations.push({ source: resolvedSource, dest })
    }
    await fs.mkdir(targetRoot, { recursive: true })
    const created: string[] = []
    try {
      for (const { source, dest } of destinations) {
        await fs.cp(source, dest, { recursive: true, errorOnExist: true, force: false })
        created.push(dest)
      }
    } catch (e) {
      for (const dest of created)
        await fs.rm(dest, { recursive: true, force: true }).catch(() => {})
      throw e
    }
    return created
  }
}
