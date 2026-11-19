import fs from 'node:fs/promises'
import path from 'node:path'
import { TOOL_IDS, type Settings, type ThemeMode, type ToolScanSettings } from '../../shared/types'
import { writeJsonFile } from '../storage/json-file'

export const DEFAULT_SETTINGS: Settings = { theme: 'system', tools: {} }
const THEMES: ThemeMode[] = ['system', 'light', 'dark']

const assertDirectory = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`无效的${label}目录`)
  if (!path.isAbsolute(value)) throw new Error(`${label}目录必须是绝对路径`)
  return path.resolve(value)
}

const parseToolScanSettings = (value: unknown): ToolScanSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('工具扫描目录设置格式错误')
  const { root, extraRoots, enabled } = value as Record<string, unknown>
  const settings: ToolScanSettings = {}
  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') throw new Error('工具启用状态格式错误')
    settings.enabled = enabled
  }
  if (root !== undefined) settings.root = assertDirectory(root, '扫描')
  if (extraRoots !== undefined) {
    if (!Array.isArray(extraRoots) || extraRoots.some((r) => typeof r !== 'string'))
      throw new Error('附加扫描目录格式错误')
    settings.extraRoots = extraRoots
      .filter((r) => r.trim())
      .map((r) => assertDirectory(r, '附加扫描'))
  }
  return settings
}

/** Validates untrusted input into a complete Settings document. */
export function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置格式错误')
  const { theme, libraryRoot, tools } = value as Record<string, unknown>
  if (!THEMES.includes(theme as ThemeMode)) throw new Error('无效的主题模式')
  const settings: Settings = { theme: theme as ThemeMode, tools: {} }
  if (libraryRoot !== undefined && libraryRoot !== null && libraryRoot !== '')
    settings.libraryRoot = assertDirectory(libraryRoot, '仓库')
  if (tools !== undefined) {
    if (!tools || typeof tools !== 'object' || Array.isArray(tools))
      throw new Error('工具设置格式错误')
    for (const [id, tool] of Object.entries(tools as Record<string, unknown>)) {
      if (!(TOOL_IDS as readonly string[]).includes(id) || !tool) continue
      const parsed = parseToolScanSettings(tool)
      if (Object.keys(parsed).length) settings.tools[id as keyof Settings['tools']] = parsed
    }
  }
  return settings
}

/** Persists app settings in `<userData>/settings.json` next to the other catalog files. */
export class SettingsService {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private file: string) {}
  async load(): Promise<Settings> {
    try {
      return parseSettings(JSON.parse(await fs.readFile(this.file, 'utf8')))
    } catch {
      // A missing file is the first run; a corrupted one must not brick the
      // app on startup, so both fall back to defaults.
      return { ...DEFAULT_SETTINGS }
    }
  }
  save(settings: Settings): Promise<void> {
    // Serialize load-modify-save callers (theme, tool toggles, full saves)
    // that arrive on different IPC handlers outside the busy mutex.
    const next = this.queue.then(() => this.write(settings))
    this.queue = next.catch(() => {})
    return next
  }
  private async write(settings: Settings): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    await writeJsonFile(this.file, settings)
  }
}
