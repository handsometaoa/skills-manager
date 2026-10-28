import { assertCompatibility, assertToolIds } from './validation'
import { dialog, shell, type BrowserWindow } from 'electron'
import { SkillStore } from '../services/skill-service'
import { SourceService } from '../services/source-service'
import { IPC_CHANNELS } from '../../shared/ipc'
import { createIpcRegistrar } from './registrar'

export function registerHandlers(
  store: SkillStore,
  sources: SourceService,
  getWindow: () => BrowserWindow,
) {
  const handle = createIpcRegistrar(getWindow)
  const affectedTools = (ids: string[] = []) =>
    store.tools
      .filter((tool) => ids.includes(tool.id))
      .map((tool) => tool.name)
      .join('、')
  handle(IPC_CHANNELS.scan, () => store.scan())
  handle(IPC_CHANNELS.addToLibrary, async (paths: unknown, compatibility: unknown) => {
    if (
      !Array.isArray(paths) ||
      paths.some((p) => typeof p !== 'string' || !sources.allowedSources.has(p))
    )
      throw new Error('请先选择导入来源')
    assertCompatibility(compatibility)
    await store.addToLibrary(
      paths.map((p) => ({ path: p, source: sources.allowedSources.get(p)! })),
      compatibility,
    )
  })
  handle(IPC_CHANNELS.collectSkill, async (id: unknown, compatibility: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    assertCompatibility(compatibility)
    await store.collectSkill(id, compatibility)
  })
  handle(IPC_CHANNELS.setCompatibility, async (id: unknown, compatibility: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    assertCompatibility(compatibility)
    await store.setCompatibility(id, compatibility)
  })
  handle(IPC_CHANNELS.installLibrary, async (ids: unknown, toolIds: unknown) => {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || !Array.isArray(toolIds))
      throw new Error('无效安装请求')
    assertToolIds(toolIds)
    await store.installLibrary(ids, toolIds)
  })
  handle(IPC_CHANNELS.deleteLibrary, async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const skill = (await store.scan()).library.find((s) => s.id === id)
    if (!skill) throw new Error('未找到仓库 Skill')
    const choice = await dialog.showMessageBox(getWindow(), {
      type: 'question',
      buttons: ['取消', '移入回收站'],
      defaultId: 0,
      cancelId: 0,
      message: `从中央仓库移除 ${skill.name}？`,
      detail: `仓库副本将移入系统回收站。各工具中已安装的独立副本会保留。\n\n${skill.path}`,
    })
    if (choice.response !== 1) throw new Error('已取消移除')
    await store.deleteLibrary(id, (directory) => shell.trashItem(directory))
  })
  handle(IPC_CHANNELS.detail, (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    return store.detail(id)
  })
  handle(IPC_CHANNELS.readFile, (id: unknown, relativePath: unknown) => {
    if (typeof id !== 'string' || typeof relativePath !== 'string') throw new Error('无效文件请求')
    return store.readFile(id, relativePath)
  })
  handle(IPC_CHANNELS.pickLocal, async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      properties: ['openDirectory'],
      title: '选择 Skill 或包含多个 Skill 的目录',
    })
    if (result.canceled) return null
    const candidates = await store.discover(result.filePaths[0])
    candidates.forEach((c) => sources.allowedSources.set(c.path, c.path))
    return candidates
  })
  handle(IPC_CHANNELS.importGit, (url: unknown) => sources.importGit(url))
  handle(IPC_CHANNELS.install, async (source: unknown, ids: unknown) => {
    if (typeof source !== 'string' || !sources.allowedSources.has(source) || !Array.isArray(ids))
      throw new Error('请先选择安装来源')
    assertToolIds(ids)
    await store.install(source, ids, sources.allowedSources.get(source))
  })
  handle(IPC_CHANNELS.prepareCopy, async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const candidate = await store.prepareCopy(id)
    sources.allowedSources.set(candidate.path, candidate.path)
    return candidate
  })
  handle(IPC_CHANNELS.deleteExternal, async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const skill = (await store.scan()).skills.find((s) => s.id === id && !s.managed)
    if (!skill) throw new Error('未找到外部 Skill')
    const tool = store.tools.find((t) => t.id === skill.toolId)!
    const choice = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      buttons: ['取消', '移入回收站'],
      defaultId: 0,
      cancelId: 0,
      message: `从 ${tool.name} 删除 ${skill.name}？`,
      detail: `将整个目录移入系统回收站，包含你手动修改或新增的文件。\n\n读取此目录的工具：${affectedTools(skill.discoveredBy)}。删除后，这些工具都将无法从此目录发现该 Skill；引用此目录的链接也会失效。\n\n${skill.path}\n\n需要恢复时，请从系统回收站还原。`,
    })
    if (choice.response !== 1) throw new Error('已取消删除')
    await store.deleteExternal(id, (directory) => shell.trashItem(directory))
  })
  handle(IPC_CHANNELS.uninstall, async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const skill = (await store.scan()).skills.find((s) => s.id === id && s.managed)
    if (!skill) throw new Error('未找到可卸载的 Skill')
    const choice = await dialog.showMessageBox(getWindow(), {
      type: 'question',
      buttons: ['取消', '卸载'],
      defaultId: 0,
      cancelId: 0,
      message: `卸载 ${skill.name}？`,
      detail: `将移出 Skill 目录，并在同目录下保留隐藏备份。修改过的文件会阻止卸载。\n\n读取此目录的工具：${affectedTools(skill.discoveredBy)}。卸载后，这些工具都将无法从此目录发现该 Skill。\n\n${skill.path}`,
    })
    if (choice.response !== 1) throw new Error('已取消卸载')
    await store.uninstall(id)
  })
  handle(IPC_CHANNELS.openPath, async (target: unknown) => {
    const snapshot = await store.scan()
    if (
      typeof target !== 'string' ||
      ![
        snapshot.libraryRoot,
        ...snapshot.tools.map((t) => t.root),
        ...snapshot.skills.map((s) => s.path),
        ...snapshot.library.map((s) => s.path),
      ].includes(target)
    )
      throw new Error('无效路径')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })
}
