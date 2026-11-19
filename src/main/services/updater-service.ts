import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../../shared/types'

/**
 * Wraps electron-updater with a small state machine pushed to the renderer.
 * Updates are checked automatically a few seconds after launch, but never
 * downloaded without an explicit user action.
 */
export class UpdaterService {
  private status: UpdateStatus
  private listeners = new Set<(status: UpdateStatus) => void>()
  private statusSilentStart = false
  constructor(private readonly getWindow: () => BrowserWindow) {
    this.status = {
      currentVersion: app.getVersion(),
      updateSupported: app.isPackaged,
      state: 'idle',
    }
    if (app.isPackaged) {
      autoUpdater.autoDownload = false
      autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
      autoUpdater.on('update-available', (info) =>
        this.set({ state: 'available', availableVersion: info.version }),
      )
      autoUpdater.on('update-not-available', () => this.set({ state: 'not-available' }))
      autoUpdater.on('download-progress', (progress) =>
        this.set({ state: 'downloading', progress: Math.round(progress.percent) }),
      )
      autoUpdater.on('update-downloaded', (info) =>
        this.set({ state: 'downloaded', availableVersion: info.version, progress: 100 }),
      )
      autoUpdater.on('error', (error) => {
        // A network hiccup during the silent start-up check must surface as a
        // recoverable state, not a dead end.
        if (this.statusSilentStart && this.status.state === 'checking')
          this.set({ state: 'not-available' })
        else this.set({ state: 'error', error: String((error as Error).message ?? error) })
      })
      // Silent start-up check; failures stay out of the user's way.
      setTimeout(() => {
        this.statusSilentStart = true
        Promise.resolve(this.check()).finally(() => {
          this.statusSilentStart = false
        })
      }, 5000).unref()
    }
  }

  private set(patch: Partial<UpdateStatus>) {
    this.status = { ...this.status, ...patch }
    this.listeners.forEach((listener) => listener(this.status))
    try {
      const window = this.getWindow()
      if (window && !window.isDestroyed()) window.webContents.send('updater-events', this.status)
    } catch {
      // The window is gone; the renderer resyncs through getUpdateStatus.
    }
  }

  subscribe(listener: (status: UpdateStatus) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  check(): UpdateStatus {
    if (!this.status.updateSupported || this.status.state === 'downloading') return this.status
    this.set({ state: 'checking', error: undefined })
    autoUpdater.checkForUpdates().catch(() => {
      // The 'error' event already records the failure; this catch only
      // prevents an unhandled rejection from the promise itself.
    })
    return this.status
  }

  download(): UpdateStatus {
    if (this.status.state !== 'available' || !this.status.updateSupported) return this.status
    this.set({ state: 'downloading', progress: 0 })
    autoUpdater.downloadUpdate().catch((error) => {
      this.set({ state: 'error', error: String((error as Error).message ?? error) })
    })
    return this.status
  }

  quitAndInstall() {
    if (this.status.state !== 'downloaded') return
    // Silent install plus relaunch keeps the assisted NSIS flow out of the way.
    autoUpdater.quitAndInstall(true, true)
  }
}
