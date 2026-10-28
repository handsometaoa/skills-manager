import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import type { Compatibility, Snapshot, ToolId, Skill, SkillDetail } from '../../shared/types'
import { SkillViewer } from './SkillViewer'
import { Icon, ToolIcon } from './Icons'
import { ImportPanel, cleanError } from './ImportPanel'
import { InstallPanel } from './InstallPanel'
import { SkillRow } from './SkillRow'
import './style.css'
import './app.css'

function App() {
  const [data, setData] = useState<Snapshot>({ tools: [], skills: [], diagnostics: [], library: [], libraryRoot: '' })
  const [page, setPage] = useState<ToolId | 'library'>('library')
  const [tab, setTab] = useState<'installed' | 'available'>('installed')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Compatibility | 'any' | 'specific'>('any')
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
    setBusy(true); setMessage(null)
    try { await action(); if (success) setMessage({ text: success }) }
    catch (e) { setMessage({ text: cleanError(e), error: true }) }
    finally { setBusy(false); setInitial(false) }
  }
  useEffect(() => { void run(refresh) }, [])
  const navigate = (next: typeof page) => { setPage(next); setTab('installed'); setQuery(''); setSelected([]); setScope('any'); setMessage(null) }
  const changeTab = (next: typeof tab) => { setTab(next); setSelected([]); setQuery('') }
  const tool = data.tools.find(t => t.id === page)
  const isLibrary = page === 'library'
  const installed = data.skills.filter(s => s.toolId === page)
  const available = data.library.filter(s => s.compatibility === 'all' || s.compatibility === page)
  const items = (isLibrary ? data.library : tab === 'installed' ? installed : available)
    .filter(s => `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()) && (!isLibrary || scope === 'any' || (scope === 'specific' ? s.compatibility !== 'all' : s.compatibility === scope)))
  const conflict = (skill: Skill) => !isLibrary && installed.some(s => s.name.toLowerCase() === skill.name.toLowerCase())
  const canSelect = (skill: Skill) => isLibrary || (tab === 'available' && !conflict(skill))
  const selectables = items.filter(canSelect)
  const chosen = data.library.filter(s => selected.includes(s.id))
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter(i => i !== id) : [...selected, id])
  const view = (skill: Skill) => void run(async () => { setViewing(await window.skills.detail(skill.id)) })
  const openImport = (skill?: Skill) => { setCollect(skill); setImporting(true); setMessage(null) }
  const installCurrent = (ids: string[] = selected) => void run(async () => {
    await window.skills.installLibrary(ids, [page as ToolId]); await refresh(); setSelected([]); setTab('installed')
  }, '安装完成。目标工具使用独立副本，请刷新其技能列表。')
  const completeImport = async () => { await refresh(); setImporting(false); setCollect(undefined); setMessage({ text: '已收入中央仓库，原始文件保持不变。' }) }
  const completeInstall = async () => { await refresh(); setInstalling(null); setDirect(undefined); setSelected([]); setMessage({ text: '复制安装完成，请在目标工具中刷新技能列表。' }) }
  return <div className="app-shell"><a className="skip-link" href="#workspace">跳至内容</a>
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><span/><span/><span/><span/></span><div>Skills Manager<small>个人技能工作台</small></div></div>
      <div className="nav-caption">工作空间</div><nav aria-label="工作空间"><button className={`nav-item ${isLibrary ? 'active' : ''}`} aria-current={isLibrary ? 'page' : undefined} onClick={() => navigate('library')}><ToolIcon id="library" small/><span>中央仓库</span><b>{data.library.length}</b></button></nav>
      <div className="nav-caption tool-caption">安装目标 <span>{data.tools.length}</span></div><nav className="tool-navigation" aria-label="AI 工具">{data.tools.map(t => <button key={t.id} className={`nav-item ${page === t.id ? 'active' : ''}`} aria-current={page === t.id ? 'page' : undefined} onClick={() => navigate(t.id)}><ToolIcon id={t.id} small/><span>{t.name}</span><b>{data.skills.filter(s => s.toolId === t.id).length}</b></button>)}</nav>
      <div className="sidebar-guide"><Icon name="copy"/><strong>一处收藏，按需安装</strong><p>仓库保存副本，每个工具独立使用。</p></div><div className="sidebar-bottom"><span className="connection-dot"/>本地存储 <span>v0.2</span></div>
    </aside>
    <div className="app-main"><header className="topbar"><div>我的工作空间<span>/</span><strong>{isLibrary ? '中央仓库' : tool?.name}</strong></div><div className="topbar-actions"><span className="local-indicator"><span className="connection-dot"/>仅存储于本机</span><button className={`icon-button ${busy ? 'is-loading' : ''}`} aria-label="刷新列表" title="重新扫描文件" disabled={busy} onClick={() => void run(refresh)}><Icon name="refresh"/></button></div></header>
    <main id="workspace" className="workspace" tabIndex={-1} aria-busy={busy}>
      <section className="workspace-heading"><div className="heading-copy"><div className="section-label">{isLibrary ? '你的能力，集中收藏' : '独立安装，随时取用'}</div><h1>{!isLibrary && <ToolIcon id={page}/>} {isLibrary ? '中央仓库' : tool?.name}<span className="heading-count">{isLibrary ? data.library.length : installed.length}</span></h1><p>{isLibrary ? '收好每一份工作方法，再交给合适的工具。' : '从中央仓库挑选技能，复制到这个工具的用户目录。'}</p></div><div className="heading-actions">{isLibrary ? <><button className="quiet-button" disabled={busy} title={data.libraryRoot} onClick={() => void run(async () => { await window.skills.openPath(data.libraryRoot) })}><Icon name="folder"/>打开仓库</button><button className="primary" disabled={busy} onClick={() => openImport()}><Icon name="plus"/>添加 Skill</button></> : <><button className="quiet-button" disabled={busy} onClick={() => void run(async () => { await window.skills.openPath(tool!.root) })}><Icon name="folder"/>打开目录</button><button className="primary" disabled={busy} onClick={() => changeTab('available')}><Icon name="plus"/>从仓库安装</button></>}</div></section>
      {isLibrary && <section className="distribution-strip" aria-label="安装概览"><div className="distribution-intro"><span className="flow-mark"><Icon name="library"/></span><div><strong>一个仓库，多个工作伙伴</strong><span>通用能力与工具专用 Skill 都能收录</span></div></div><div className="distribution-tools">{data.tools.map(t => <button key={t.id} onClick={() => navigate(t.id)}><ToolIcon id={t.id} small/><span>{t.name}<small>{data.skills.filter(s => s.toolId === t.id).length} 个已安装</small></span><Icon name="arrow"/></button>)}</div></section>}
      {!isLibrary && <div className="tool-path"><span className="path-label">用户目录</span><code>{tool?.root}</code><span>复制安装</span></div>}
      {message && <div role={message.error ? 'alert' : 'status'} className={`notice ${message.error ? 'error' : 'success'}`}><Icon name={message.error ? 'warning' : 'check'}/><span>{message.text}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setMessage(null)}><Icon name="close"/></button></div>}
      <div className="library-toolbar">{isLibrary ? <div className="filter-tabs" aria-label="适用范围筛选">{(['any', 'all', 'specific'] as const).map(value => <button key={value} className={(value === 'specific' ? scope !== 'any' && scope !== 'all' : scope === value) ? 'active' : ''} onClick={() => { setScope(value); setSelected([]) }}>{value === 'any' ? '全部技能' : value === 'all' ? '通用' : '工具专用'}</button>)}{scope !== 'any' && scope !== 'all' && <select aria-label="筛选专用工具" value={scope} onChange={e => { setScope(e.target.value as ToolId | 'specific'); setSelected([]) }}><option value="specific">全部工具</option>{data.tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</div> : <div className="filter-tabs" aria-label="工具技能视图"><button className={tab === 'installed' ? 'active' : ''} onClick={() => changeTab('installed')}>已安装 <span>{installed.length}</span></button><button className={tab === 'available' ? 'active' : ''} onClick={() => changeTab('available')}>从仓库选择 <span>{available.length}</span></button></div>}
      <div className="search-field"><Icon name="search"/><input aria-label="搜索技能" placeholder="搜索名称或描述…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-button" aria-label="清除搜索" onClick={() => setQuery('')}><Icon name="close"/></button>}</div></div>
      <section className="skill-table" aria-label={isLibrary ? '仓库技能' : '工具技能'}><div className="table-header"><div className="name-column">{(isLibrary || tab === 'available') && <input type="checkbox" aria-label="选择当前列表全部技能" disabled={busy || !selectables.length} checked={!!selectables.length && selectables.every(s => selected.includes(s.id))} onChange={e => setSelected(e.target.checked ? Array.from(new Set([...selected, ...selectables.map(s => s.id)])) : selected.filter(id => !selectables.some(s => s.id === id)))}/>}<span>技能 / 描述</span></div><span>{isLibrary || tab === 'available' ? '适用范围' : '管理方式'}</span><span>{isLibrary ? '安装到' : tab === 'available' ? '当前状态' : '仓库状态'}</span><span className="actions-column">操作</span></div>
      {initial ? <div className="skeleton-list">{[1, 2, 3].map(n => <div className="skeleton-row" key={n}><span/><span/><span/></div>)}</div> : items.length ? items.map(skill => <SkillRow key={skill.id} skill={skill} tools={data.tools} installed={data.skills} library={data.library} selectable={canSelect(skill)} selected={selected.includes(skill.id)} busy={busy} available={!isLibrary && tab === 'available'} toggle={() => toggle(skill.id)} view={() => view(skill)} install={() => { if (!isLibrary) installCurrent([skill.id]); else { setDirect(undefined); setInstalling([skill]) } }} collect={() => openImport(skill)} open={() => void run(async () => { await window.skills.openPath(skill.path) })} copy={() => { setDirect(skill); setInstalling([skill]) }} compatibility={value => void run(async () => { await window.skills.setCompatibility(skill.id, value); await refresh() }, '适用范围已更新。')} remove={() => void run(async () => {
        if (skill.toolId === 'library') await window.skills.deleteLibrary(skill.id)
        else if (skill.managed) await window.skills.uninstall(skill.id)
        else await window.skills.deleteExternal(skill.id)
        await refresh(); setSelected(selected.filter(id => id !== skill.id))
      }, skill.toolId === 'library' ? '已移出仓库，各工具中的副本保留。' : skill.managed ? '卸载完成，原目录旁已保留备份。' : '已移入系统回收站。')}/>) : <div className="empty-state"><span className="empty-illustration"><Icon name={isLibrary ? 'library' : tab === 'available' ? 'download' : 'file'}/><i/><i/></span><h2>{query ? '没有找到匹配的 Skill' : isLibrary ? '把你的第一个 Skill 收进来' : tab === 'available' ? '仓库里还没有适用的 Skill' : '这里还没有安装 Skill'}</h2><p>{query ? '换个关键词，或清除搜索条件。' : isLibrary ? '从本地、Git 仓库导入，或到工具页面收录已有技能。' : tab === 'available' ? '先添加通用技能，或标记为这个工具专用。' : '从仓库选择需要的工作方法，按需复制安装。'}</p>{!query && <button className="primary" disabled={busy} onClick={() => isLibrary ? openImport() : tab === 'installed' ? changeTab('available') : navigate('library')}><Icon name={isLibrary ? 'plus' : 'arrow'}/>{isLibrary ? '添加 Skill' : tab === 'installed' ? '浏览中央仓库' : '前往中央仓库'}</button>}</div>}</section>
      <div className="list-footer"><span>{items.length} 个 Skill{isLibrary ? ` · ${data.library.filter(s => s.compatibility === 'all').length} 个通用` : ' · 用户级安装'}</span><span><span className="connection-dot"/>副本相互独立，不自动同步</span></div>
      {data.diagnostics.length > 0 && <section className="diagnostics"><button className="text-button" onClick={() => setShowDiagnostics(!showDiagnostics)}><Icon name="warning"/>{data.diagnostics.length} 条扫描诊断{showDiagnostics ? ' · 收起' : ' · 展开'}</button>{showDiagnostics && <div>{data.diagnostics.map((d, i) => <p key={i}>{d}</p>)}</div>}</section>}
      {selected.length > 0 && (isLibrary || tab === 'available') && <div className="selection-bar"><span className="selection-number">{selected.length}</span><strong>个 Skill 已选择</strong><button className="text-button" disabled={busy} onClick={() => setSelected([])}>取消选择</button><button className="primary" disabled={busy || !chosen.length} onClick={() => { if (isLibrary) { setDirect(undefined); setInstalling(chosen) } else installCurrent() }}><Icon name="download"/>{busy ? '正在安装…' : isLibrary ? '选择安装目标' : `安装到 ${tool?.name}`}</button></div>}
    </main></div>
    {importing && <ImportPanel tools={data.tools} collect={collect} onClose={() => { setImporting(false); setCollect(undefined) }} onDone={completeImport}/>}
    {installing && <InstallPanel skills={installing} tools={data.tools} installed={data.skills} direct={direct} onClose={() => { setInstalling(null); setDirect(undefined) }} onDone={completeInstall}/>}
    {viewing && <SkillViewer detail={viewing} toolName={viewing.skill.toolId === 'library' ? '中央仓库' : data.tools.find(t => t.id === viewing.skill.toolId)?.name ?? ''} onClose={() => setViewing(null)}/>}
  </div>
}
createRoot(document.getElementById('root')!).render(<App/> )
