import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FolderGit2, FolderOpen, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type {
  Compatibility,
  ProjectScan,
  ProjectToolScan,
  Skill,
  SkillDetail,
} from '../../../../shared/types'
import { cleanError } from '../../lib/errors'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { CompatibilitySelect } from '../library/CompatibilitySelect'
import { SkillViewer } from '../skills/SkillViewer'
import { ToolIcon } from '../../components/ui/Icons'
import type { WorkspaceController } from '../workspace/useWorkspace'
import { cn } from '@/lib/utils'

const SUPPORTED_MATRIX = [
  ['Claude Code', '.claude/skills'],
  ['Codex', '.agents/skills'],
  ['Cursor', '.cursor/skills'],
  ['Qoder', '.qoder/skills'],
  ['OpenCode', '.opencode/skills'],
  ['Gemini CLI', '.gemini/skills'],
  ['GitHub Copilot', '.github/skills'],
] as const

export function ProjectView({ workspace }: { workspace: WorkspaceController }) {
  const activeProjectPath = workspace.activeProjectPath
  const [scan, setScan] = useState<ProjectScan | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<{ skill: Skill; detail: SkillDetail } | null>(null)
  const [collecting, setCollecting] = useState<Skill | null>(null)
  const [installing, setInstalling] = useState(false)

  // Rescan whenever the active project changes (selected from the sidebar).
  useEffect(() => {
    if (!activeProjectPath) {
      setScan(null)
      return
    }
    setBusy(true)
    window.skills
      .scanProject(activeProjectPath)
      .then(setScan)
      .catch((e) => toast.error(cleanError(e)))
      .finally(() => setBusy(false))
  }, [activeProjectPath])

  const rescan = async () => {
    if (!activeProjectPath) return
    setBusy(true)
    try {
      setScan(await window.skills.scanProject(activeProjectPath))
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  /** Removes the project from the app registry (the folder itself is untouched). */
  const removeProject = async () => {
    try {
      const settings = await window.skills.getSettings()
      await window.skills.saveSettings({
        ...settings,
        projects: (settings.projects ?? []).filter((p) => p.path !== activeProjectPath),
      })
      await workspace.reloadProjects()
      workspace.setActiveProjectPath(null)
      setScan(null)
      toast.success('已从应用移除项目（文件夹未删除）')
    } catch (e) {
      toast.error(cleanError(e))
    }
  }

  const openViewer = async (skill: Skill) => {
    setBusy(true)
    try {
      const detail = await window.skills.projectBrowse(skill.path)
      setViewing({ skill, detail })
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const collectSkill = async (skill: Skill, compatibility: Compatibility) => {
    setBusy(true)
    try {
      await window.skills.addToLibrary([skill.path], compatibility)
      await rescan()
      toast.success(`已收入中央仓库：${skill.name}`)
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
      setCollecting(null)
    }
  }

  const removeSkill = async (skill: Skill) => {
    setBusy(true)
    try {
      await window.skills.projectDelete(skill.path)
      await rescan()
      toast.success(`已移入回收站：${skill.name}`)
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  /** Re-deploys the current library content over a tracked project copy. */
  const updateFromLibrary = async (skill: Skill) => {
    if (!skill.libraryId) return
    setBusy(true)
    try {
      const result = await window.skills.deployUpdate(skill.libraryId)
      await rescan()
      toast.success(
        `已从仓库更新：${skill.name}（${result.updated.length} 个副本同步${result.skipped.length ? `，${result.skipped.length} 个跳过` : ''}）`,
      )
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {!activeProjectPath ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-16 text-center">
          <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-xl">
            <FolderGit2 className="size-6" />
          </span>
          <h2 className="text-base font-semibold">管理项目级 Skill</h2>
          <p className="text-muted-foreground max-w-lg text-sm">
            添加一个项目文件夹，扫描其中各 Agent 的项目级 Skill
            目录并进行管理。已添加的项目会保留在侧边栏，可随时移除；删除的 Skill
            进入回收站，之后仍可还原。
          </p>
          <Button disabled={busy} onClick={() => void workspace.addProject()}>
            <FolderOpen />
            添加项目
          </Button>
          <div className="text-muted-foreground grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            {SUPPORTED_MATRIX.map(([name, dir]) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="w-28 text-right">{name}</span>
                <code className="bg-muted rounded px-1.5 py-0.5">{dir}</code>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-lg font-semibold">
                <FolderGit2 className="size-5" />
                {activeProjectPath.split(/[\\/]/).filter(Boolean).at(-1)}
              </h1>
              <code className="text-muted-foreground text-xs break-all">{scan?.projectPath}</code>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void rescan()}>
                <RefreshCw />
                重新扫描
              </Button>
              <Button disabled={busy} onClick={() => setInstalling(true)}>
                <Plus />
                从仓库安装
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void removeProject()}>
                移除项目
              </Button>
            </div>
          </section>
          {scan ? (
            <>
              {scan.tools.map((tool) => (
                <ToolSection
                  key={tool.toolId}
                  tool={tool}
                  busy={busy}
                  onView={(skill) => void openViewer(skill)}
                  onCollect={(skill) => setCollecting(skill)}
                  onUpdate={(skill) => void updateFromLibrary(skill)}
                  onDelete={(skill) => void removeSkill(skill)}
                />
              ))}
              {scan.diagnostics.length > 0 && (
                <div className="text-muted-foreground space-y-1 rounded-lg bg-muted/60 p-3 text-xs">
                  {scan.diagnostics.map((d, i) => (
                    <p key={i} className="break-all">
                      {d}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground rounded-xl border bg-card p-8 text-center text-sm">
              正在扫描项目…
            </div>
          )}
        </>
      )}

      {viewing && (
        <SkillViewer
          detail={viewing.detail}
          toolName="项目"
          onClose={() => setViewing(null)}
          access={{
            read: (relativePath) => window.skills.projectReadFile(viewing.skill.path, relativePath),
            write: (relativePath, content) =>
              window.skills.projectWriteFile(viewing.skill.path, relativePath, content),
          }}
        />
      )}
      {collecting && (
        <CollectDialog
          skill={collecting}
          tools={workspace.data.tools}
          busy={busy}
          onClose={() => setCollecting(null)}
          onConfirm={(compatibility) => void collectSkill(collecting, compatibility)}
        />
      )}
      {installing && scan && (
        <InstallDialog
          scan={scan}
          library={workspace.data.library}
          busy={busy}
          setBusy={setBusy}
          onClose={() => setInstalling(false)}
          onInstalled={() => void rescan()}
        />
      )}
    </div>
  )
}

function ToolSection({
  tool,
  busy,
  onView,
  onCollect,
  onUpdate,
  onDelete,
}: {
  tool: ProjectToolScan
  busy: boolean
  onView: (skill: Skill) => void
  onCollect: (skill: Skill) => void
  onUpdate: (skill: Skill) => void
  onDelete: (skill: Skill) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <ToolIcon id={tool.toolId} small />
        <span className="text-sm font-medium">{tool.name}</span>
        <code className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-xs">
          {tool.directory}
        </code>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {tool.skills.length} 个
        </span>
      </div>
      {tool.skills.length ? (
        <div className="divide-y">
          {tool.skills.map((skill) => (
            <div key={skill.path} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
                <FolderOpen className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{skill.name}</div>
                <p className="text-muted-foreground truncate text-xs">{skill.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => onView(skill)}>
                  查看
                </Button>
                {skill.libraryId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    title="把仓库当前版本复制到本项目目录"
                    onClick={() => onUpdate(skill)}
                  >
                    从仓库更新
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onCollect(skill)}
                  >
                    收录
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除 ${skill.name}`}
                  disabled={busy}
                  className="text-muted-foreground hover:bg-destructive hover:text-white"
                  onClick={() => onDelete(skill)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground px-3 py-3 text-xs">该目录下暂无 Skill。</p>
      )}
    </section>
  )
}

function CollectDialog({
  skill,
  tools,
  busy,
  onClose,
  onConfirm,
}: {
  skill: Skill
  tools: WorkspaceController['data']['tools']
  busy: boolean
  onClose: () => void
  onConfirm: (compatibility: Compatibility) => void
}) {
  const [compatibility, setCompatibility] = useState<Compatibility>('all')
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">收入中央仓库</DialogTitle>
          <DialogDescription className="text-xs">
            复制 {skill.name} 的独立副本入库，原目录保持不变。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <CompatibilitySelect value={compatibility} onChange={setCompatibility} tools={tools} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy} onClick={() => onConfirm(compatibility)}>
            收入仓库
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Picks library skills and target Agent directories, then installs into the project. */
function InstallDialog({
  scan,
  library,
  busy,
  setBusy,
  onClose,
  onInstalled,
}: {
  scan: ProjectScan
  library: Skill[]
  busy: boolean
  setBusy: (value: boolean) => void
  onClose: () => void
  onInstalled: () => void
}) {
  const [chosen, setChosen] = useState<string[]>([])
  const [targets, setTargets] = useState<string[]>([])

  const blockedFor = (toolId: string) => {
    const tool = scan.tools.find((t) => t.toolId === toolId)
    const names = tool?.skills.map((s) => s.name.toLowerCase()) ?? []
    const conflict = chosen.some((path) => {
      const skill = library.find((s) => s.path === path)
      return skill && names.includes(skill.name.toLowerCase())
    })
    return conflict
  }

  const submit = async () => {
    setBusy(true)
    try {
      for (const toolId of targets) {
        await window.skills.installToProject({
          sources: chosen,
          toolId: toolId as ProjectToolScan['toolId'],
          projectPath: scan.projectPath,
        })
      }
      toast.success(`已安装到项目内 ${targets.length} 个目录`)
      onInstalled()
    } catch (e) {
      toast.error(cleanError(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">从仓库安装到项目</DialogTitle>
          <DialogDescription className="text-xs">
            选择 Skill 与目标 Agent 目录，复制安装到项目内。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">01 / 选择 Skill（仓库）</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                disabled={busy || !library.length}
                onClick={() =>
                  setChosen(chosen.length === library.length ? [] : library.map((s) => s.path))
                }
              >
                {chosen.length === library.length ? '取消全选' : '全选'}
              </Button>
            </div>
            <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {library.map((skill) => (
                <Label
                  key={skill.path}
                  className="hover:bg-accent/60 flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-normal"
                >
                  <Checkbox
                    aria-label={`选择 ${skill.name}`}
                    checked={chosen.includes(skill.path)}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      setChosen(
                        checked ? [...chosen, skill.path] : chosen.filter((p) => p !== skill.path),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                  <small className="text-muted-foreground shrink-0 text-xs">
                    {skill.compatibility === 'all' ? '通用' : `${skill.compatibility?.length} 工具`}
                  </small>
                </Label>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <span className="text-xs font-medium">02 / 目标 Agent 目录</span>
            <div className="grid grid-cols-1 gap-1.5">
              {scan.tools.map((tool) => {
                const blocked = blockedFor(tool.toolId)
                return (
                  <Label
                    key={tool.toolId}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-normal',
                      blocked ? 'opacity-50' : 'cursor-pointer hover:bg-accent/60',
                      targets.includes(tool.toolId) && 'border-primary/40 bg-primary/5',
                    )}
                  >
                    <Checkbox
                      aria-label={`安装到 ${tool.name}`}
                      checked={targets.includes(tool.toolId)}
                      disabled={busy || blocked}
                      onCheckedChange={(checked) =>
                        setTargets(
                          checked
                            ? [...targets, tool.toolId]
                            : targets.filter((id) => id !== tool.toolId),
                        )
                      }
                    />
                    <ToolIcon id={tool.toolId} small />
                    <span className="flex-1 truncate">{tool.name}</span>
                    <small className="text-muted-foreground truncate text-xs">
                      {blocked ? '已存在同名 Skill' : tool.directory}
                    </small>
                  </Label>
                )
              })}
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={busy || !chosen.length || !targets.length}
            onClick={() => void submit()}
          >
            <Plus />
            {busy ? '正在安装…' : `安装到 ${targets.length} 个目录`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
