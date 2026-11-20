import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  RegisteredProject,
  Snapshot,
  ToolId,
  Skill,
  SkillDetail,
} from '../../../../shared/types'
import { cleanError } from '../../lib/errors'
import { discoveredBy, supportsTool } from '../../../../shared/compatibility'

export function useWorkspace() {
  const [data, setData] = useState<Snapshot>({
    tools: [],
    skills: [],
    diagnostics: [],
    library: [],
    libraryRoot: '',
    trash: [],
  })
  const [page, setPage] = useState<ToolId | 'library' | 'trash' | 'settings' | 'project'>('library')
  const [tab, setTab] = useState<'installed' | 'available'>('installed')
  const [ownership, setOwnership] = useState<'all' | 'own' | 'shared'>('all')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ToolId | 'all' | 'any' | 'specific'>('any')
  const [busy, setBusy] = useState(false)
  const [initial, setInitial] = useState(true)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [viewing, setViewing] = useState<SkillDetail | null>(null)
  const [importing, setImporting] = useState(false)
  /** Where the 新建 Skill dialog is creating into: the library or a tool id. */
  const [creating, setCreating] = useState<'library' | ToolId | null>(null)
  const [collect, setCollect] = useState<Skill | undefined>()
  const [installing, setInstalling] = useState<Skill[] | null>(null)
  const [direct, setDirect] = useState<Skill | undefined>()
  const [selected, setSelected] = useState<string[]>([])
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [projects, setProjects] = useState<RegisteredProject[]>([])
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(null)
  const refresh = async () => setData(await window.skills.scan())
  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      if (success) setMessage({ text: success })
    } catch (e) {
      setMessage({ text: cleanError(e), error: true })
    } finally {
      setBusy(false)
      setInitial(false)
    }
  }
  useEffect(() => {
    void run(refresh)
    window.skills
      .getSettings()
      .then((s) => setProjects(s.projects ?? []))
      .catch(() => {})
  }, [])
  const reloadProjects = async () => {
    try {
      const s = await window.skills.getSettings()
      setProjects(s.projects ?? [])
    } catch {
      // ignore
    }
  }
  /** Registers a project folder (persisted in settings) and opens it. */
  const addProject = async (): Promise<string | null> => {
    try {
      const dir = await window.skills.pickDirectory()
      if (!dir) return null
      const scan = await window.skills.scanProject(dir)
      const resolved = scan.projectPath
      const settings = await window.skills.getSettings()
      const existing = settings.projects ?? []
      if (!existing.some((p) => p.path === resolved))
        await window.skills.saveSettings({
          ...settings,
          projects: [...existing, { path: resolved, addedAt: new Date().toISOString() }],
        })
      setProjects((current) =>
        current.some((p) => p.path === resolved)
          ? current
          : [...current, { path: resolved, addedAt: new Date().toISOString() }],
      )
      setActiveProjectPath(resolved)
      navigate('project')
      return resolved
    } catch (e) {
      toast.error(cleanError(e))
      return null
    }
  }
  const navigate = (next: typeof page) => {
    setPage(next)
    setOwnership('all')
    setTab('installed')
    setQuery('')
    setSelected([])
    setScope('any')
    setMessage(null)
  }
  const changeTab = (next: typeof tab) => {
    setTab(next)
    setSelected([])
    setQuery('')
  }
  const tool = data.tools.find((t) => t.id === page)
  const isLibrary = page === 'library'
  const isTrash = page === 'trash'
  const isSettings = page === 'settings'
  const isProject = page === 'project'
  const installed = !tool ? [] : data.skills.filter((s) => discoveredBy(s, tool.id))
  const own = installed.filter(
    (s) => s.path.replaceAll('\\', '/') === `${tool?.root.replaceAll('\\', '/')}/${s.name}`,
  )
  const shared = installed.filter((s) => !own.includes(s))
  const available = data.library.filter((s) => !!tool && supportsTool(s.compatibility, tool.id))
  const items = (
    isLibrary
      ? data.library
      : tab === 'installed'
        ? ownership === 'own'
          ? own
          : ownership === 'shared'
            ? shared
            : installed
        : available
  ).filter(
    (s) =>
      `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()) &&
      (!isLibrary ||
        scope === 'any' ||
        (scope === 'specific'
          ? s.compatibility !== 'all'
          : scope === 'all'
            ? s.compatibility === 'all'
            : s.compatibility !== 'all' && supportsTool(s.compatibility, scope))),
  )
  const conflict = (skill: Skill) =>
    !isLibrary && installed.some((s) => s.name.toLowerCase() === skill.name.toLowerCase())
  const canSelect = (skill: Skill) => isLibrary || (tab === 'available' && !conflict(skill))
  const selectables = items.filter(canSelect)
  const chosen = data.library.filter((s) => selected.includes(s.id))
  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((i) => i !== id) : [...selected, id])
  const view = (skill: Skill) =>
    void run(async () => {
      setViewing(await window.skills.detail(skill.id))
    })
  const openImport = (skill?: Skill) => {
    setCollect(skill)
    setImporting(true)
    setMessage(null)
  }
  const installCurrent = (ids: string[] = selected) =>
    void run(
      async () => {
        await window.skills.installLibrary(ids, [page as ToolId])
        await refresh()
        setSelected([])
        setTab('installed')
      },
      `安装完成。${tool?.instructions ?? '请刷新技能列表。'}`,
    )
  const completeImport = async () => {
    await refresh()
    setImporting(false)
    setCollect(undefined)
    setMessage({ text: '已收入中央仓库，原始文件保持不变。' })
  }
  const completeInstall = async () => {
    await refresh()
    setInstalling(null)
    setDirect(undefined)
    setSelected([])
    setMessage({ text: '复制安装完成，请在目标工具中刷新技能列表。' })
  }
  const completeCreate = async (name: string) => {
    await refresh()
    setCreating(null)
    setMessage({ text: `Skill 模板「${name}」已创建，可以继续编辑 SKILL.md 补充内容。` })
  }

  return {
    data,
    setData,
    page,
    setPage,
    tab,
    setTab,
    query,
    setQuery,
    scope,
    setScope,
    busy,
    initial,
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
    isSettings,
    isProject,
    ownership,
    setOwnership,
    own,
    shared,
    installed,
    available,
    items,
    canSelect,
    selectables,
    chosen,
    toggle,
    view,
    openImport,
    installCurrent,
    completeImport,
    completeInstall,
    completeCreate,
    projects,
    reloadProjects,
    addProject,
    activeProjectPath,
    setActiveProjectPath,
  }
}
export type WorkspaceController = ReturnType<typeof useWorkspace>
