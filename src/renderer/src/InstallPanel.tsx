import { useState } from 'react'
import type { Skill, Tool, ToolId } from '../../shared/types'
import { Drawer } from './Drawer'
import { Icon, ToolIcon } from './Icons'
import { cleanError } from './ImportPanel'

export function InstallPanel({ skills, tools, installed, direct, onClose, onDone }: { skills: Skill[]; tools: Tool[]; installed: Skill[]; direct?: Skill; onClose: () => void; onDone: () => Promise<void> }) {
  const [targets, setTargets] = useState<ToolId[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const blocked = (id: ToolId) => {
    if (direct?.toolId === id) return '来源工具'
    if (skills.some(s => s.compatibility && s.compatibility !== 'all' && s.compatibility !== id)) return '包含其他工具专用 Skill'
    if (skills.some(s => installed.some(i => i.toolId === id && i.name.toLowerCase() === s.name.toLowerCase()))) return '已安装或存在同名 Skill'
    if (id === 'zcode' && skills.some(s => s.description.length > 1024)) return '描述超出 ZCode 限制'
    return ''
  }
  const submit = async () => {
    setBusy(true); setError('')
    try {
      if (direct) { const candidate = await window.skills.prepareCopy(direct.id); await window.skills.install(candidate.path, targets) }
      else await window.skills.installLibrary(skills.map(s => s.id), targets)
      await onDone()
    } catch (e) { setError(cleanError(e)); setBusy(false) }
  }
  return <Drawer title={direct ? '复制到其他工具' : '从仓库安装'} subtitle="每个工具获得一份独立副本，来源文件保持不变。" busy={busy} onClose={onClose} footer={<><span>{skills.length} 个 Skill · {targets.length} 个目标</span><button className="primary" disabled={busy || !targets.length} onClick={() => void submit()}><Icon name="download"/>{busy ? '正在安装…' : '复制安装'}</button></>}>
    <div className="form-section"><span className="step-label">01 / 已选 Skill</span><div className="install-skill-list">{skills.map(s => <div key={s.id}><Icon name="file"/><span>{s.name}</span><small>{s.compatibility && s.compatibility !== 'all' ? '工具专用' : '独立副本'}</small></div>)}</div></div>
    <div className="form-section"><span className="step-label">02 / 目标工具</span><div className="install-targets">{tools.map(t => { const reason = blocked(t.id); return <label className={`install-target ${reason ? 'disabled' : ''} ${targets.includes(t.id) ? 'chosen' : ''}`} key={t.id}><ToolIcon id={t.id}/><span><strong>{t.name}</strong><small>{reason || t.root}</small></span><input type="checkbox" aria-label={`安装到 ${t.name}`} disabled={busy || !!reason} checked={targets.includes(t.id)} onChange={e => setTargets(e.target.checked ? [...targets, t.id] : targets.filter(id => id !== t.id))}/></label> })}</div></div>
    <div className="subtle-note"><Icon name="copy"/><span>按目录复制全部文件，同名内容不会覆盖。安装后请在目标工具中刷新技能列表，ZCode 还需确认启用。</span></div>{error && <div role="alert" className="notice error"><Icon name="warning"/>{error}</div>}
  </Drawer>
}
