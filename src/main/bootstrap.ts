import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { SkillStore } from './services/skill-service'
import { SourceService } from './services/source-service'
import { SettingsService } from './services/settings-service'
import { UpdaterService } from './services/updater-service'
import { ProjectService } from './services/project-service'
import { registerHandlers } from './ipc/register-handlers'
import { createMainWindow } from './window'

export function bootstrap(): void {
  // Keep existing installations and the library accessible after the product rename.
  app.setPath(
    'userData',
    path.join(app.getPath('appData'), app.isPackaged ? 'Skill Manage' : 'skill-manage'),
  )
  app.setName('Skills Manager')
  let mainWindow: BrowserWindow | null = null
  let sources: SourceService | undefined
  let updater: UpdaterService | undefined
  let cleanupComplete = false
  app
    .whenReady()
    .then(async () => {
      const settings = new SettingsService(path.join(app.getPath('userData'), 'settings.json'))
      const saved = await settings.load()
      // `themeSource` drives the renderer's `prefers-color-scheme`, so the UI
      // and the window background follow the same source of truth.
      nativeTheme.themeSource = saved.theme
      const store = new SkillStore(app.getPath('userData'), os.homedir(), saved)
      await store.init()
      sources = new SourceService((root) => store.discover(root))
      const projects = new ProjectService((path, source) =>
        sources!.allowedSources.set(path, source),
      )
      updater = new UpdaterService(() => {
        if (!mainWindow || mainWindow.isDestroyed()) throw new Error('应用窗口已关闭')
        return mainWindow
      })
      registerHandlers(store, sources, settings, updater, projects, () => {
        if (!mainWindow || mainWindow.isDestroyed()) throw new Error('应用窗口已关闭')
        return mainWindow
      })
      const openWindow = () => {
        mainWindow = createMainWindow()
        mainWindow.on('closed', () => {
          mainWindow = null
        })
      }
      openWindow()
      app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length) openWindow()
      })
    })
    .catch((error) => {
      dialog.showErrorBox('启动失败', String(error))
      app.quit()
    })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (cleanupComplete || !sources) return
    event.preventDefault()
    cleanupComplete = true
    void sources.cleanup().finally(() => app.quit())
  })
}
