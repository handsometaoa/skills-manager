import { useEffect, useState } from 'react'
import type { Snapshot, ToolId, Skill, SkillDetail } from '../../../../shared/types'
import { cleanError } from '../../lib/errors'
import { discoveredBy, supportsTool } from '../../../../shared/compatibility'

export function useWorkspace() {
  const [data, setData] = useState<Snapshot>({
    tools: [],
    skills: [],
    diagnostics: [],
    library: [],
    libraryRoot: '',
  })
  const [page, setPage] = useState<ToolId | 'library'>('library')
  const [tab, setTab] = useState<'installed' | 'available'>('installed')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ToolId | 'all' | 'any' | 'specific'>('any')
  const [busy, setBusy] = useState(false)
  const [initial, setInitial] = useState(true)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [viewing, setViewing] = useState<SkillDetail | null>(null)
  const [importing, setImporting] = useState(false)
  const [collect, setCollect] = useState<Skill | undefined>()
  const [installing, setInstalling] = useState<Skill[] | null>(null)
  const [direct, setDirect] = useState<Skill | undefined>()
  const [selected, setSelected] = useState<string[]>([])
  const [showDiagnostics, setShowDiagnostics] = useState(false)
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
  }, [])
  const navigate = (next: typeof page) => {
    setPage(next)
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
  const installed = isLibrary ? [] : data.skills.filter((s) => discoveredBy(s, page))
  const available = data.library.filter((s) => !isLibrary && supportsTool(s.compatibility, page))
  const items = (isLibrary ? data.library : tab === 'installed' ? installed : available).filter(
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
  }
}
export type WorkspaceController = ReturnType<typeof useWorkspace>
