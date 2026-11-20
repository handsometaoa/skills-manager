import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eraser,
  FolderOpen,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react'
import type {
  Settings,
  ThemeMode,
  ToolId,
  ToolScanSettings,
  UpdateStatus,
} from '../../../../shared/types'
import { TOOL_IDS } from '../../../../shared/types'
import { cleanError } from '../../lib/errors'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group'
import { Switch } from '../../components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { ToolIcon, TOOL_NAMES } from '../../components/ui/Icons'
import type { WorkspaceController } from '../workspace/useWorkspace'
import { cn } from '@/lib/utils'

type ToolDraft = { root: string; extraRoots: string[] }
type ToolDrafts = Record<ToolId, ToolDraft>

const emptyDrafts = (): ToolDrafts => {
  const drafts = {} as ToolDrafts
  for (const id of TOOL_IDS) drafts[id] = { root: '', extraRoots: [] }
  return drafts
}

const UPDATE_TEXT: Record<UpdateStatus['state'], (status: UpdateStatus) => string> = {
  idle: () => '尚未检查更新',
  checking: () => '正在检查更新…',
  'not-available': () => '已是最新版本',
  available: (s) => `发现新版本 v${s.availableVersion}`,
  downloading: (s) => `正在下载更新 ${s.progress ?? 0}%`,
  downloaded: (s) => `v${s.availableVersion} 已就绪，重启后安装`,
  error: (s) => `更新失败：${s.error ?? '请稍后重试'}`,
}

export function SettingsView({ workspace }: { workspace: WorkspaceController }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [drafts, setDrafts] = useState<ToolDrafts>(emptyDrafts)
  const [pendingRoot, setPendingRoot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Compact accordion: only the tools being edited stay expanded.
  const [expandedTools, setExpandedTools] = useState<Set<ToolId>>(new Set())
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    window.skills
      .getSettings()
      .then((loaded) => {
        setSettings(loaded)
        const drafts = emptyDrafts()
        for (const id of TOOL_IDS)
          drafts[id] = {
            root: loaded.tools[id]?.root ?? '',
            extraRoots: [...(loaded.tools[id]?.extraRoots ?? [])],
          }
        setDrafts(drafts)
      })
      .catch((e) => toast.error(cleanError(e)))
    window.skills
      .getUpdateStatus()
      .then(setUpdate)
      .catch(() => {})
    return window.skills.onUpdateStatus(setUpdate)
  }, [])

  const checkUpdate = async () => {
    try {
      setUpdate(await window.skills.checkForUpdates())
    } catch (e) {
      toast.error(cleanError(e))
    }
  }

  const downloadUpdateNow = async () => {
    try {
      setUpdate(await window.skills.downloadUpdate())
    } catch (e) {
      toast.error(cleanError(e))
    }
  }

  const changeTheme = (theme: ThemeMode) => {
    setSettings((s) => (s ? { ...s, theme } : s))
    window.skills.setTheme(theme).catch((e) => toast.error(cleanError(e)))
  }

  /** Enables/disables an agent immediately; disabled agents disappear from the workspace. */
  const toggleTool = async (id: ToolId, enabled: boolean) => {
    if (!settings) return
    setBusy(true)
    try {
      const value: ToolScanSettings = { ...(settings.tools[id] ?? {}), enabled }
      const tools = { ...settings.tools, [id]: value }
      // Re-enabled tools with no custom configuration need no stored entry.
      if (enabled && !value.root && !value.extraRoots?.length) delete tools[id]
      const next = await window.skills.saveSettings({ ...settings, tools })
      setSettings(next)
      await workspace.refresh()
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const browse = async () => {
    try {
      const dir = await window.skills.pickDirectory()
      if (dir) setPendingRoot(dir)
    } catch (e) {
      toast.error(cleanError(e))
    }
  }

  const applyLibraryRoot = async (target: string | undefined) => {
    if (!settings) return
    setBusy(true)
    try {
      const next = await window.skills.saveSettings({ ...settings, libraryRoot: target })
      setSettings(next)
      await workspace.refresh()
      toast.success(target ? `中央仓库已迁移到 ${next.libraryRoot}` : '已恢复默认仓库位置')
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
      setPendingRoot(null)
    }
  }

  const saveTools = async () => {
    if (!settings) return
    setBusy(true)
    try {
      const tools: Settings['tools'] = {}
      for (const id of TOOL_IDS) {
        const root = drafts[id].root.trim()
        const extraRoots = drafts[id].extraRoots.map((r) => r.trim()).filter(Boolean)
        const value: ToolScanSettings = { ...settings.tools[id] }
        // Carry the enabled flag over: a disabled agent must stay disabled
        // after saving scan directories.
        if (settings.tools[id]?.enabled === false) value.enabled = false
        if (root) value.root = root
        else delete value.root
        if (extraRoots.length) value.extraRoots = extraRoots
        else delete value.extraRoots
        if (Object.keys(value).length) tools[id] = value
      }
      const next = await window.skills.saveSettings({ ...settings, tools })
      setSettings(next)
      await workspace.refresh()
      toast.success('扫描目录已保存，并重新扫描完成。')
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!settings)
    return (
      <div className="settings-view mx-auto max-w-3xl">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="mt-3 h-10 w-full rounded-lg" />
        <Skeleton className="mt-3 h-64 w-full rounded-lg" />
      </div>
    )

  const defaultRoot = !settings.libraryRoot
  return (
    <div className="settings-view mx-auto max-w-3xl">
      <Card className="gap-0 divide-y overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
          <span className="text-sm font-medium">外观</span>
          <RadioGroup
            className="flex flex-wrap gap-1.5"
            value={settings.theme}
            onValueChange={changeTheme}
          >
            {(
              [
                ['system', Monitor, '跟随系统'],
                ['light', Sun, '明亮'],
                ['dark', Moon, '黑暗'],
              ] as const
            ).map(([value, Icon, label]) => (
              <Label
                key={value}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-normal transition-colors',
                  settings.theme === value
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <Icon className="size-3.5" />
                {label}
                <RadioGroupItem value={value} className="sr-only" />
              </Label>
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <span className="text-sm font-medium">中央仓库位置</span>
          <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 text-xs">
            {workspace.data.libraryRoot || '…'}
          </code>
          {defaultRoot ? <Badge variant="secondary">默认位置</Badge> : <Badge>自定义</Badge>}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            title="更改位置时自动迁移现有内容，目标须为空文件夹"
            onClick={() => void browse()}
          >
            <FolderOpen className="size-3.5" />
            更改…
          </Button>
          {!defaultRoot && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingRoot('')}>
              <RotateCcw className="size-3.5" />
              恢复默认
            </Button>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 px-6 py-3">
            <span className="text-sm font-medium">Agent 扫描目录</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void saveTools()}>
              保存扫描目录
            </Button>
          </div>
          <div className="divide-y border-t">
            {TOOL_IDS.map((id) => {
              const tool = workspace.data.tools.find((t) => t.id === id)
              const draft = drafts[id]
              const enabled = settings.tools[id]?.enabled !== false
              const custom = !!draft.root || draft.extraRoots.length > 0
              const open = expandedTools.has(id)
              const name = tool?.name ?? TOOL_NAMES[id]
              return (
                <div key={id}>
                  <div
                    className={cn(
                      'flex w-full items-center gap-2.5 px-6 py-2 transition-colors',
                      !enabled && 'opacity-55',
                    )}
                  >
                    <button
                      className="hover:bg-accent/60 -mx-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1 text-left transition-colors"
                      aria-expanded={open}
                      onClick={() =>
                        setExpandedTools((current) => {
                          const next = new Set(current)
                          if (next.has(id)) next.delete(id)
                          else next.add(id)
                          return next
                        })
                      }
                    >
                      {open ? (
                        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                      ) : (
                        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                      )}
                      <ToolIcon id={id} small />
                      <span className="text-sm font-medium">{name}</span>
                      <Badge variant={!enabled ? 'outline' : custom ? 'default' : 'secondary'}>
                        {!enabled ? '已停用' : custom ? '自定义' : '默认目录'}
                      </Badge>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                        {draft.root || tool?.root || '—'}
                      </span>
                    </button>
                    <Switch
                      checked={enabled}
                      disabled={busy}
                      aria-label={`启用 ${name}`}
                      onCheckedChange={(value) => void toggleTool(id, value)}
                    />
                  </div>
                  {open && (
                    <div className="space-y-2 px-6 pb-3">
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`${name} 主扫描目录`}
                          placeholder={tool?.root ?? '默认目录'}
                          value={draft.root}
                          disabled={busy}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [id]: { ...d[id], root: e.target.value } }))
                          }
                          className="text-xs"
                        />
                        {custom && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="恢复此工具的默认设置"
                            disabled={busy}
                            onClick={() =>
                              setDrafts((d) => ({ ...d, [id]: { root: '', extraRoots: [] } }))
                            }
                          >
                            <Eraser />
                          </Button>
                        )}
                      </div>
                      {draft.extraRoots.map((extra, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            aria-label="附加扫描目录"
                            placeholder="附加扫描目录（仅发现，不安装）"
                            value={extra}
                            disabled={busy}
                            onChange={(e) =>
                              setDrafts((d) => {
                                const extraRoots = [...d[id].extraRoots]
                                extraRoots[index] = e.target.value
                                return { ...d, [id]: { ...d[id], extraRoots } }
                              })
                            }
                            className="text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="移除附加目录"
                            disabled={busy}
                            onClick={() =>
                              setDrafts((d) => ({
                                ...d,
                                [id]: {
                                  ...d[id],
                                  extraRoots: d[id].extraRoots.filter((_, i) => i !== index),
                                },
                              }))
                            }
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground h-7 text-xs"
                        disabled={busy}
                        onClick={() =>
                          setDrafts((d) => ({
                            ...d,
                            [id]: { ...d[id], extraRoots: [...d[id].extraRoots, ''] },
                          }))
                        }
                      >
                        <Plus />
                        添加附加目录
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-muted-foreground px-6 py-2 text-xs">
            覆盖默认目录（同时是安装目标），附加目录仅用于发现；共享关系自动跟随。
          </p>
        </div>

        {update && (
          <div className="flex flex-wrap items-center gap-2 px-6 py-3">
            <span className="text-sm font-medium">关于与更新</span>
            {update.updateSupported ? (
              <>
                <Badge variant="secondary">v{update.currentVersion}</Badge>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  {UPDATE_TEXT[update.state](update)}
                </span>
                {update.state === 'available' && (
                  <Button size="sm" disabled={busy} onClick={() => void downloadUpdateNow()}>
                    <Download className="size-3.5" />
                    下载
                  </Button>
                )}
                {update.state === 'downloaded' && (
                  <Button size="sm" onClick={() => void window.skills.quitAndInstall()}>
                    <RotateCcw className="size-3.5" />
                    重启安装
                  </Button>
                )}
                {(update.state === 'idle' ||
                  update.state === 'not-available' ||
                  update.state === 'error') && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void checkUpdate()}
                  >
                    <RefreshCw className="size-3.5" />
                    检查更新
                  </Button>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs">开发模式下自动更新不可用</span>
            )}
          </div>
        )}
      </Card>

      <AlertDialog
        open={pendingRoot !== null}
        onOpenChange={(open) => !open && setPendingRoot(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRoot ? '更改中央仓库位置？' : '恢复默认仓库位置？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRoot ? (
                <>
                  现有仓库中的全部内容将自动迁移到：
                  <code className="bg-muted mt-1 block truncate rounded px-2 py-1 text-xs">
                    {pendingRoot}
                  </code>
                  迁移期间请不要关闭应用。目标目录必须是空文件夹。
                </>
              ) : (
                <>
                  仓库内容将从自定义位置迁移回应用数据目录下的默认 library
                  文件夹，迁移完成后立即重新扫描。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void applyLibraryRoot(pendingRoot || undefined)
              }}
            >
              {busy ? '正在迁移…' : '开始迁移'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
