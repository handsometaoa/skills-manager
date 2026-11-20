import { useEffect, useState } from 'react'
import { toast, Toaster } from 'sonner'
import {
  Copy,
  FolderOpen,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react'
import { SkillTable } from './features/workspace/SkillTable'
import { WorkspaceToolbar } from './features/workspace/WorkspaceToolbar'
import { SkillViewer } from './features/skills/SkillViewer'
import { ProjectView } from './features/project/ProjectView'
import { ToolIcon } from './components/ui/Icons'
import { ImportPanel } from './features/library/ImportPanel'
import { InstallPanel } from './features/library/InstallPanel'
import { CreateSkillDialog } from './features/library/CreateSkillDialog'
import { SettingsView } from './features/settings/SettingsView'
import { Sidebar } from './components/layout/Sidebar'
import { useWorkspace } from './features/workspace/useWorkspace'
import { discoveredBy } from '../../shared/compatibility'
import { TrashPanel } from './features/workspace/TrashPanel'
import { Button } from '@/components/ui/button'
import { ConfirmProvider } from './lib/confirm'
import { isMac } from './lib/platform'

export function App() {
  const workspace = useWorkspace()
  const {
    data,
    page,
    tab,
    busy,
    message,
    setMessage,
    viewing,
    setViewing,
    importing,
    setImporting,
    creating,
    setCreating,
    collect,
    setCollect,
    installing,
    setInstalling,
    direct,
    setDirect,
    selected,
    setSelected,
    showDiagnostics,
    setShowDiagnostics,
    refresh,
    run,
    navigate,
    changeTab,
    tool,
    isLibrary,
    isTrash,
    projects,
    activeProjectPath,
    setActiveProjectPath,
    addProject,
    isSettings,
    isProject,
    installed,
    items,
    chosen,
    openImport,
    installCurrent,
    completeImport,
    completeInstall,
    completeCreate,
  } = workspace

  // The workspace hook reports results through `message`; surface them as toasts.
  useEffect(() => {
    if (!message) return
    if (message.error) toast.error(message.text)
    else toast.success(message.text)
    setMessage(null)
  }, [message, setMessage])

  // Frameless-window state for the ZCode-style controls in the title bar.
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let active = true
    window.skills
      .windowIsMaximized()
      .then((value) => {
        if (active) setMaximized(value)
      })
      .catch(() => {})
    const unsubscribe = window.skills.onWindowMaximizeChange(setMaximized)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const pageName = isTrash
    ? '回收站'
    : isSettings
      ? '设置'
      : isProject
        ? '项目 Skill'
        : isLibrary
          ? '中央仓库'
          : tool?.name

  return (
    <ConfirmProvider>
    <div className="flex h-screen overflow-hidden">
      <a href="#workspace" className="sr-only focus:not-sr-only">
        跳至内容
      </a>
      <Sidebar
        data={data}
        page={page}
        isLibrary={isLibrary}
        navigate={navigate}
        projects={projects}
        activeProjectPath={activeProjectPath}
        setActiveProjectPath={setActiveProjectPath}
        addProject={addProject}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-region-drag flex h-12 shrink-0 items-center justify-between gap-3 border-b pl-4">
          <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
            我的工作空间<span>/</span>
            <strong className="truncate font-semibold text-foreground">{pageName}</strong>
          </div>
          <div className="flex h-full items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              className="app-region-no-drag mr-1"
              aria-label="刷新列表"
              title="重新扫描文件"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              <RefreshCw className={busy ? 'animate-spin' : ''} />
            </Button>
            {/* macOS renders native traffic lights (hiddenInset) instead. */}
            <div className="app-region-no-drag ml-1 flex items-center self-stretch">
              {isMac ? null : (
                <>
                  <button
                    className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:bg-foreground/20 flex h-full w-11 items-center justify-center"
                    aria-label="最小化"
                    onClick={() => void window.skills.windowMinimize()}
                  >
                    <Minus className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:bg-foreground/20 flex h-full w-11 items-center justify-center"
                    aria-label={maximized ? '还原' : '最大化'}
                    onClick={() => void window.skills.windowMaximizeToggle()}
                  >
                    {maximized ? (
                      <Copy className="size-3.5" strokeWidth={1.75} />
                    ) : (
                      <Square className="size-3.5" strokeWidth={1.75} />
                    )}
                  </button>
                  <button
                    className="text-muted-foreground hover:bg-[#c42b1c] hover:text-white active:bg-[#a82718] flex h-full w-11 items-center justify-center"
                    aria-label="关闭"
                    onClick={() => void window.skills.windowClose()}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>
        <main
          id="workspace"
          className="flex-1 overflow-y-auto px-6 py-5"
          tabIndex={-1}
          aria-busy={busy}
        >
          {!isTrash && !isSettings && !isProject && (
            <section className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  {isLibrary ? <ToolIcon id="library" /> : tool && <ToolIcon id={tool.id} />}
                  {isLibrary ? '中央仓库' : tool?.name}
                  <span className="text-muted-foreground rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums">
                    {isLibrary ? data.library.length : installed.length}
                  </span>
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {isLibrary ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      title={data.libraryRoot}
                      onClick={() =>
                        void run(async () => {
                          await window.skills.openPath(data.libraryRoot)
                        })
                      }
                    >
                      <FolderOpen />
                      打开仓库
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setCreating('library')}
                    >
                      <Sparkles />
                      新建 Skill
                    </Button>
                    <Button disabled={busy} onClick={() => openImport()}>
                      <Plus />
                      添加 Skill
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await window.skills.openPath(tool!.root)
                        })
                      }
                    >
                      <FolderOpen />
                      打开目录
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => tool && setCreating(tool.id)}
                    >
                      <Sparkles />
                      新建 Skill
                    </Button>
                    <Button disabled={busy} onClick={() => changeTab('available')}>
                      <Plus />
                      从仓库安装
                    </Button>
                  </>
                )}
              </div>
            </section>
          )}
          {isLibrary && !isTrash && !isSettings && !isProject && (
            <section
              className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4"
              aria-label="安装概览"
            >
              {data.tools.map((t) => (
                <button
                  key={t.id}
                  className="hover:bg-accent flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
                  onClick={() => navigate(t.id)}
                >
                  <ToolIcon id={t.id} small />
                  <span className="leading-tight">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <small className="text-muted-foreground block text-xs">
                      {data.skills.filter((s) => discoveredBy(s, t.id)).length} 个可发现
                    </small>
                  </span>
                </button>
              ))}
            </section>
          )}
          {!isLibrary && !isTrash && !isSettings && !isProject && (
            <div className="mb-4 space-y-2 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">用户目录</span>
                <code className="bg-muted rounded px-1.5 py-0.5 text-xs break-all">
                  {tool?.root}
                </code>
              </div>
              <div className="text-muted-foreground text-xs">{tool?.instructions}</div>
              <details className="group text-sm">
                <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs">
                  查看扫描目录与共享关系
                </summary>
                <div className="mt-2 space-y-1">
                  {tool?.discoveryRoots.map((root) => (
                    <p key={root} className="flex flex-wrap items-center gap-2 text-xs">
                      <code className="bg-muted rounded px-1.5 py-0.5">{root}</code>
                      <span className="text-muted-foreground">
                        {data.tools
                          .filter((t) => t.discoveryRoots.includes(root))
                          .map((t) => t.name)
                          .join('、')}
                      </span>
                    </p>
                  ))}
                  <p className="text-muted-foreground text-xs">
                    可发现表示目录中存在文件，不代表已启用或实际加载。同名技能的优先级由目标工具决定。
                  </p>
                </div>
              </details>
            </div>
          )}
          {isTrash ? (
            <TrashPanel workspace={workspace} />
          ) : isSettings ? (
            <SettingsView workspace={workspace} />
          ) : isProject ? (
            <ProjectView workspace={workspace} />
          ) : (
            <>
              <WorkspaceToolbar workspace={workspace} />
              <SkillTable workspace={workspace} />
              <div className="text-muted-foreground mt-4 text-xs">
                {items.length} 个 Skill
                {isLibrary
                  ? ` · ${data.library.filter((s) => s.compatibility === 'all').length} 个通用`
                  : ` · 自己的 ${workspace.own.length} · 共享 ${workspace.shared.length}`}
              </div>
            </>
          )}
          {data.diagnostics.length > 0 && (
            <section className="mt-4">
              <button
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
              >
                <TriangleAlert className="size-3.5" />
                {data.diagnostics.length} 条扫描诊断{showDiagnostics ? ' · 收起' : ' · 展开'}
              </button>
              {showDiagnostics && (
                <div className="bg-muted text-muted-foreground mt-2 space-y-1 rounded-lg p-3 text-xs">
                  {data.diagnostics.map((d, i) => (
                    <p key={i} className="break-all">
                      {d}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
          {selected.length > 0 && (isLibrary || tab === 'available') && (
            <div className="bg-background/95 fixed bottom-4 left-[calc(var(--sidebar-width)+1rem)] z-20 flex items-center gap-3 rounded-xl border p-3 pl-4 shadow-lg">
              <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs tabular-nums">
                {selected.length}
              </span>
              <strong className="text-sm">个 Skill 已选择</strong>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected([])}>
                取消选择
              </Button>
              <Button
                size="sm"
                disabled={busy || !chosen.length}
                onClick={() => {
                  if (isLibrary) {
                    setDirect(undefined)
                    setInstalling(chosen)
                  } else installCurrent()
                }}
              >
                {busy ? '正在安装…' : isLibrary ? '选择安装目标' : `安装到 ${tool?.name}`}
              </Button>
            </div>
          )}
        </main>
      </div>
      {creating && (
        <CreateSkillDialog
          target={creating === 'library' ? 'library' : data.tools.find((t) => t.id === creating)!}
          tools={data.tools}
          onClose={() => setCreating(null)}
          onDone={completeCreate}
        />
      )}
      {importing && (
        <ImportPanel
          tools={data.tools}
          collect={collect}
          onClose={() => {
            setImporting(false)
            setCollect(undefined)
          }}
          onDone={completeImport}
        />
      )}
      {installing && (
        <InstallPanel
          skills={installing}
          tools={data.tools}
          installed={data.skills}
          direct={direct}
          onClose={() => {
            setInstalling(null)
            setDirect(undefined)
          }}
          onDone={completeInstall}
        />
      )}
      {viewing && (
        <SkillViewer
          detail={viewing}
          toolName={
            viewing.skill.toolId === 'library'
              ? '中央仓库'
              : (data.tools.find((t) => t.id === viewing.skill.toolId)?.name ?? '')
          }
          onClose={() => setViewing(null)}
          onSaved={() => void run(refresh)}
        />
      )}
      <Toaster position="bottom-right" offset={16} />
    </div>
    </ConfirmProvider>
  )
}
