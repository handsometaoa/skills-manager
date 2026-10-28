import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SkillStore } from './core'
import type { Compatibility, ToolId } from '../shared/types'

let window: BrowserWindow
let busy = false
const allowedSources = new Map<string, string>()
const gitTemps: string[] = []
// Retain the original storage locations when changing the public product name.
app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? 'Skill Manage' : 'skill-manage'))
app.setName('Skills Manager')
app.whenReady().then(async () => {
  const store = new SkillStore(app.getPath('userData'), os.homedir())
  await store.init()
  const handle = (name: string, action: (...args: any[]) => unknown) => ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('无效调用来源')
    if (busy) throw new Error('其他操作正在执行，请稍后重试')
    busy = true
    try { return await action(...args) } finally { busy = false }
  })
  handle('scan', () => store.scan())
  handle('library-add', async (paths: unknown, compatibility: Compatibility) => {
    if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !allowedSources.has(p))) throw new Error('请先选择导入来源')
    await store.addToLibrary(paths.map(p => ({ path: p, source: allowedSources.get(p)! })), compatibility)
  })
  handle('library-collect', async (id: unknown, compatibility: Compatibility) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    await store.collectSkill(id, compatibility)
  })
  handle('library-compatibility', async (id: unknown, compatibility: Compatibility) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    await store.setCompatibility(id, compatibility)
  })
  handle('library-install', async (ids: unknown, toolIds: unknown) => {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || !Array.isArray(toolIds)) throw new Error('无效安装请求')
    await store.installLibrary(ids, toolIds as ToolId[])
  })
  handle('library-delete', async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const skill = (await store.scan()).library.find(s => s.id === id)
    if (!skill) throw new Error('未找到仓库 Skill')
    const choice = await dialog.showMessageBox(window, {
      type: 'question', buttons: ['取消', '移入回收站'], defaultId: 0, cancelId: 0,
      message: `从中央仓库移除 ${skill.name}？`,
      detail: `仓库副本将移入系统回收站。各工具中已安装的独立副本会保留。\n\n${skill.path}`
    })
    if (choice.response !== 1) throw new Error('已取消移除')
    await store.deleteLibrary(id, directory => shell.trashItem(directory))
  })
  handle('skill-detail', (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    return store.detail(id)
  })
  handle('skill-read-file', (id: unknown, relativePath: unknown) => {
    if (typeof id !== 'string' || typeof relativePath !== 'string') throw new Error('无效文件请求')
    return store.readFile(id, relativePath)
  })
  handle('pick-local', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: '选择 Skill 或包含多个 Skill 的目录' })
    if (result.canceled) return null
    const candidates = await store.discover(result.filePaths[0])
    candidates.forEach(c => allowedSources.set(c.path, c.path))
    return candidates
  })
  handle('git-import', async (url: unknown) => {
    if (typeof url !== 'string' || url.length > 2048) throw new Error('请输入有效的 HTTPS Git 仓库地址')
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('仅支持不含凭据的 HTTPS Git 地址')
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manage-'))
    gitTemps.push(temp)
    try {
      await promisify(execFile)('git', ['-c', 'core.hooksPath=' + path.join(temp, 'no-hooks'), '-c', 'protocol.file.allow=never', 'clone', '--depth', '1', '--', parsed.href, path.join(temp, 'repo')], { timeout: 120000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } })
      const candidates = await store.discover(path.join(temp, 'repo'))
      candidates.forEach(c => allowedSources.set(c.path, `${parsed.href}#${path.relative(path.join(temp, 'repo'), c.path).split(path.sep).join('/')}`))
      return candidates
    } catch (e) { throw new Error(`Git 导入失败，请确认已安装 Git 且仓库可公开访问。${(e as Error).message}`) }
  })
  handle('install', async (source: unknown, ids: unknown) => {
    if (typeof source !== 'string' || !allowedSources.has(source) || !Array.isArray(ids)) throw new Error('请先选择安装来源')
    await store.install(source, ids as ToolId[], allowedSources.get(source))
  })
  handle('prepare-copy', async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const candidate = await store.prepareCopy(id)
    allowedSources.set(candidate.path, candidate.path)
    return candidate
  })
  handle('delete-external', async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const skill = (await store.scan()).skills.find(s => s.id === id && !s.managed)
    if (!skill) throw new Error('未找到外部 Skill')
    const tool = store.tools.find(t => t.id === skill.toolId)!
    const choice = await dialog.showMessageBox(window, {
      type: 'warning', buttons: ['取消', '移入回收站'], defaultId: 0, cancelId: 0,
      message: `从 ${tool.name} 删除 ${skill.name}？`,
      detail: `将整个目录移入系统回收站，包含你手动修改或新增的文件。其他工具中已复制的独立副本不受影响；引用此目录的链接会失效。\n\n${skill.path}\n\n需要恢复时，请从系统回收站还原。`
    })
    if (choice.response !== 1) throw new Error('已取消删除')
    await store.deleteExternal(id, directory => shell.trashItem(directory))
  })
  handle('uninstall', async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效 Skill')
    const skill = (await store.scan()).skills.find(s => s.id === id && s.managed)
    if (!skill) throw new Error('未找到可卸载的 Skill')
    const choice = await dialog.showMessageBox(window, { type: 'question', buttons: ['取消', '卸载'], defaultId: 0, cancelId: 0, message: `卸载 ${skill.name}？`, detail: '将移出工具的 Skill 目录，并在同目录下保留隐藏备份。修改过的文件会阻止卸载。' })
    if (choice.response !== 1) throw new Error('已取消卸载')
    await store.uninstall(id)
  })
  handle('open-path', async (target: unknown) => {
    const snapshot = await store.scan()
    if (typeof target !== 'string' || ![snapshot.libraryRoot, ...snapshot.tools.map(t => t.root), ...snapshot.skills.map(s => s.path), ...snapshot.library.map(s => s.path)].includes(target)) throw new Error('无效路径')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })
  const createWindow = () => {
    window = new BrowserWindow({ width: 1280, height: 850, minWidth: 1000, minHeight: 680, backgroundColor: '#f7f8fa', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
}).catch(error => { dialog.showErrorBox('启动失败', String(error)); app.quit() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => { for (const dir of gitTemps) void fs.rm(dir, { recursive: true, force: true }) })
