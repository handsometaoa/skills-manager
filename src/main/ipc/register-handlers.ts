import { assertCompatibility, assertToolIds } from './validation'
import { dialog, ipcMain, nativeTheme, shell, type BrowserWindow } from 'electron'
import { SkillStore } from '../services/skill-service'
import { SourceService } from '../services/source-service'
import { SettingsService, parseSettings } from '../services/settings-service'
import { UpdaterService } from '../services/updater-service'
import { ProjectService } from '../services/project-service'
import { isToolId } from '../../shared/compatibility'
import { IPC_CHANNELS } from '../../shared/ipc'
import { createIpcRegistrar } from './registrar'
import type { ThemeMode } from '../../shared/types'

export function registerHandlers(
  store: SkillStore,
  sources: SourceService,
  settings: SettingsService,
  updater: UpdaterService,
  projects: ProjectService,
  getWindow: () => BrowserWindow,
) {
  const handle = createIpcRegistrar(getWindow)
  // Settings and theme calls stay available while a long scan or install holds
  // the global busy mutex, so they bypass the registrar but keep sender checks.
  const handleDirect = (
    channel: Parameters<typeof ipcMain.handle>[0],
    action: (...args: unknown[]) => unknown,
  ) => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const window = getWindow()
      if (
        !window ||
        window.isDestroyed() ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw new Error('无效调用来源')
      return action(...args)
    })
  }
  const assertTheme: (value: unknown) => asserts value is ThemeMode = (value) => {
    if (value !== 'system' && value !== 'light' && value !== 'dark')
      throw new Error('无效的主题模式')
  }
  const affectedTools = (ids: string[] = []) =>
    store.tools
      .filter((tool) => ids.includes(tool.id))
      .map((tool) => tool.name)
      .join('、')
  handle(IPC_CHANNELS.scan, () => store.scan())
  handle(IPC_CHANNELS.createSkill, (input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('无效的创建请求')
    const { name, description, target, compatibility } = input as Record<string, unknown>
    if (typeof name !== 'string' || typeof description !== 'string')
      throw new Error('请填写 Skill 名称与描述')
    if (target !== 'library' && !isToolId(target)) throw new Error('请选择创建位置')
    if (target === 'library') {
      const scope = compatibility ?? 'all'
      assertCompatibility(scope)
      return store.createSkill({ name, description, target, compatibility: scope })
    }
    return store.createSkill({ name, description, target })
  })
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
      detail: `仓库副本将移入应用回收站，可从左侧回收站还原。各工具中已安装的独立副本会保留。\n\n${skill.path}`,
    })
    if (choice.response !== 1) throw new Error('已取消移除')
    await store.deleteLibrary(id)
  })
  handle(IPC_CHANNELS.restoreTrash, async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效回收站项目')
    await store.restoreTrash(id)
  })
  handle(IPC_CHANNELS.deleteTrash, async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效回收站项目')
    const entry = (await store.scan()).trash.find((item) => item.id === id)
    if (!entry) throw new Error('回收站项目已不存在')
    const choice = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      buttons: ['取消', '永久删除'],
      defaultId: 0,
      cancelId: 0,
      message: `永久删除 ${entry.skill.name}？`,
      detail: '回收站中的这份 Skill 将被永久删除，无法还原。',
    })
    if (choice.response !== 1) throw new Error('已取消永久删除')
    await store.deleteTrash(id)
  })
  handle(IPC_CHANNELS.detail, (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    return store.detail(id)
  })
  handle(IPC_CHANNELS.readFile, (id: unknown, relativePath: unknown) => {
    if (typeof id !== 'string' || typeof relativePath !== 'string') throw new Error('无效文件请求')
    return store.readFile(id, relativePath)
  })
  handle(IPC_CHANNELS.writeFile, (id: unknown, relativePath: unknown, content: unknown) => {
    if (typeof id !== 'string' || typeof relativePath !== 'string' || typeof content !== 'string')
      throw new Error('无效文件请求')
    return store.writeFile(id, relativePath, content)
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
      detail: `将整个目录移入应用回收站，包含你手动修改或新增的文件。\n\n读取此目录的工具：${affectedTools(skill.discoveredBy)}。删除后，这些工具都将无法从此目录发现该 Skill；引用此目录的链接也会失效。\n\n${skill.path}\n\n需要恢复时，请从左侧回收站还原。`,
    })
    if (choice.response !== 1) throw new Error('已取消删除')
    await store.deleteExternal(id)
  })
  handle(IPC_CHANNELS.uninstall, async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const skill = (await store.scan()).skills.find((s) => s.id === id && s.managed)
    if (!skill) throw new Error('未找到可卸载的 Skill')
    const choice = await dialog.showMessageBox(getWindow(), {
      type: 'question',
      buttons: ['取消', '移入回收站'],
      defaultId: 0,
      cancelId: 0,
      message: `卸载 ${skill.name}？`,
      detail: `将整个 Skill 目录移入应用回收站，还原时保留安装关联。\n\n读取此目录的工具：${affectedTools(skill.discoveredBy)}。移除后，这些工具都将无法从此目录发现该 Skill。\n\n${skill.path}`,
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
  handle(IPC_CHANNELS.scanProject, async (projectPath: unknown) => projects.scan(projectPath))
  handle(IPC_CHANNELS.installToProject, async (input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('请先选择安装来源')
    const request = input as Record<string, unknown>
    if (
      !Array.isArray(request.sources) ||
      !request.sources.length ||
      request.sources.some((s) => typeof s !== 'string' || !sources.allowedSources.has(s))
    )
      throw new Error('请先选择安装来源')
    return projects.install(input)
  })
  handle(IPC_CHANNELS.projectBrowse, (absPath: unknown) => projects.browse(absPath))
  handle(IPC_CHANNELS.projectReadFile, (absPath: unknown, relativePath: unknown) =>
    projects.readFile(absPath, relativePath),
  )
  handle(
    IPC_CHANNELS.projectWriteFile,
    (absPath: unknown, relativePath: unknown, content: unknown) =>
      projects.writeFile(absPath, relativePath, content),
  )
  handle(IPC_CHANNELS.projectDelete, async (absPath: unknown) => {
    if (typeof absPath !== 'string') throw new Error('无效 Skill')
    const skill = await projects.browse(absPath)
    const choice = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      buttons: ['取消', '移入回收站'],
      defaultId: 0,
      cancelId: 0,
      message: `从项目中删除 ${skill.skill.name}？`,
      detail: `整个目录将移入应用回收站，包含手动修改过的文件。\n\n${skill.skill.path}\n\n需要恢复时，请从回收站还原。`,
    })
    if (choice.response !== 1) throw new Error('已取消删除')
    await store.deleteExternalPath(absPath)
  })
  handleDirect(IPC_CHANNELS.getSettings, () => settings.load())
  // Saving mutates the live store and can relocate the whole library, so it
  // belongs under the busy mutex next to installs and collection. Theme and
  // window controls stay available during long operations instead.
  handle(IPC_CHANNELS.saveSettings, async (value: unknown) => {
    const next = parseSettings(value)
    const current = await settings.load()
    // Relocating the library moves existing content before the change persists;
    // a failed move leaves both settings and files untouched.
    if ((next.libraryRoot ?? undefined) !== (current.libraryRoot ?? undefined))
      await store.setLibraryRoot(next.libraryRoot)
    if (next.libraryRoot) next.libraryRoot = store.libraryRoot
    else delete next.libraryRoot
    await settings.save(next)
    // Push tool registry changes (enable/disable, scan directories) into the
    // live store so they take effect without an app restart.
    store.applySettings(next)
    nativeTheme.themeSource = next.theme
    return next
  })
  handleDirect(IPC_CHANNELS.setTheme, async (theme: unknown) => {
    assertTheme(theme)
    const current = await settings.load()
    await settings.save({ ...current, theme })
    nativeTheme.themeSource = theme
  })
  handleDirect(IPC_CHANNELS.pickDirectory, async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      properties: ['openDirectory'],
      title: '选择目录',
    })
    return result.canceled ? null : result.filePaths[0]
  })
  // Window controls: trivial main-process calls with no shared state, kept out
  // of the busy mutex so they always respond, even mid-scan.
  handleDirect(IPC_CHANNELS.windowMinimize, () => {
    getWindow().minimize()
  })
  handleDirect(IPC_CHANNELS.windowMaximizeToggle, () => {
    const window = getWindow()
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })
  handleDirect(IPC_CHANNELS.windowClose, () => {
    getWindow().close()
  })
  handleDirect(IPC_CHANNELS.windowIsMaximized, () => getWindow().isMaximized())
  // Updater calls are network-only and must stay responsive during long
  // filesystem operations, so they bypass the busy mutex too.
  handleDirect(IPC_CHANNELS.getUpdateStatus, () => updater.getStatus())
  handleDirect(IPC_CHANNELS.checkForUpdates, () => updater.check())
  handleDirect(IPC_CHANNELS.downloadUpdate, () => updater.download())
  handleDirect(IPC_CHANNELS.quitAndInstall, () => updater.quitAndInstall())
}
