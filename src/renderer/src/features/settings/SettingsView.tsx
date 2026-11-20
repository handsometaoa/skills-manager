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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
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
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )

  const defaultRoot = !settings.libraryRoot
  return (
    <div className="settings-view max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">外观</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            className="grid grid-cols-3 gap-3"
            value={settings.theme}
            onValueChange={changeTheme}
          >
            {(
              [
                ['system', Monitor, '跟随系统'],
                ['light', Sun, '明亮模式'],
                ['dark', Moon, '黑暗模式'],
              ] as const
            ).map(([value, Icon, label]) => (
              <Label
                key={value}
                className="hover:bg-accent/60 flex cursor-pointer flex-col items-start gap-2 rounded-lg border p-3 font-normal"
              >
                <div className="flex w-full items-center justify-between">
                  <Icon className="text-muted-foreground size-4" />
                  <RadioGroupItem value={value} />
                </div>
                <span className="text-sm">{label}</span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">中央仓库位置</CardTitle>
          <CardDescription>更改位置时自动迁移现有内容，目标须为空文件夹。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 text-xs">
              {workspace.data.libraryRoot || '…'}
            </code>
            {defaultRoot ? <Badge variant="secondary">默认位置</Badge> : <Badge>自定义</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void browse()}>
              <FolderOpen />
              更改位置…
            </Button>
            {!defaultRoot && (
              <Button variant="ghost" disabled={busy} onClick={() => setPendingRoot('')}>
                <RotateCcw />
                恢复默认
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="px-6 pt-6 pb-4">
          <CardTitle className="text-base">Agent 扫描目录</CardTitle>
          <CardDescription>
            覆盖默认技能目录（同时是安装目标），或添加附加发现目录。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
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
                      'flex w-full items-center gap-2.5 px-6 py-2.5 transition-colors',
                      !enabled && 'opacity-55',
                    )}
                  >
                    <button
                      className="hover:bg-accent/60 -mx-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors"
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
                    <div className="space-y-2 px-6 pb-4">
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
          <div className="flex items-center justify-end border-t px-6 py-4">
            <Button disabled={busy} onClick={() => void saveTools()}>
              保存扫描目录
            </Button>
          </div>
        </CardContent>
      </Card>

      {update && (
        <Card>
          <CardHeader className="px-6 pt-6 pb-4">
            <CardTitle className="text-base">关于与更新</CardTitle>
            <CardDescription>当前版本 v{update.currentVersion}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            {update.updateSupported ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {update.state === 'checking' && '正在检查更新…'}
                    {update.state === 'not-available' && '已是最新版本'}
                    {update.state === 'available' && (
                      <span>
                        发现新版本 <strong>v{update.availableVersion}</strong>
                      </span>
                    )}
                    {update.state === 'downloading' && (
                      <span>
                        正在下载更新
                        {update.progress !== undefined && ` · ${update.progress}%`}
                      </span>
                    )}
                    {update.state === 'downloaded' && (
                      <span>v{update.availableVersion} 已就绪，重启后安装</span>
                    )}
                    {update.state === 'error' && (
                      <span className="text-destructive">
                        更新失败：{update.error ?? '请稍后重试'}
                      </span>
                    )}
                    {update.state === 'idle' && '尚未检查更新'}
                  </span>
                  {update.state === 'available' && (
                    <Button disabled={busy} onClick={() => void downloadUpdateNow()}>
                      <Download />
                      下载更新
                    </Button>
                  )}
                  {update.state === 'downloaded' && (
                    <Button onClick={() => void window.skills.quitAndInstall()}>
                      <RotateCcw />
                      重启并安装
                    </Button>
                  )}
                  {(update.state === 'idle' ||
                    update.state === 'not-available' ||
                    update.state === 'error') && (
                    <Button variant="outline" disabled={busy} onClick={() => void checkUpdate()}>
                      <RefreshCw />
                      检查更新
                    </Button>
                  )}
                </div>
                {update.state === 'downloading' && (
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-[width]"
                      style={{ width: `${update.progress ?? 0}%` }}
                    />
                  </div>
                )}
                {update.state === 'downloaded' && (
                  <p className="text-muted-foreground text-xs">
                    更新包已校验完成，重启应用即自动安装并重新启动。
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-xs">开发模式下自动更新不可用。</p>
            )}
          </CardContent>
        </Card>
      )}

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
