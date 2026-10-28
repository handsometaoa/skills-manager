import type { Compatibility, Skill, Tool, ToolId } from '../../shared/types'
import { Icon, ToolIcon } from './Icons'
import { CompatibilitySelect } from './ImportPanel'

interface Props {
  skill: Skill; tools: Tool[]; installed: Skill[]; library: Skill[]
  selectable: boolean; selected: boolean; busy: boolean; available: boolean
  toggle: () => void; view: () => void; install: () => void; collect: () => void
  open: () => void; remove: () => void; copy: () => void; compatibility: (value: Compatibility) => void
}
export function SkillRow({ skill, tools, installed, library, selectable, selected, busy, available, toggle, view, install, collect, open, remove, copy, compatibility }: Props) {
  const central = skill.toolId === 'library'
  const conflict = available && !selectable
  return <article className={`skill-row ${selected ? 'is-selected' : ''}`}>
    <div className="skill-main">{(central || available) && <input type="checkbox" aria-label={`选择 ${skill.name}`} disabled={busy || !selectable} checked={selected} onChange={toggle}/>}
      <button className="document-icon" title={`查看 ${skill.name}`} disabled={busy} onClick={view}><Icon name="file"/></button><div className="skill-copy"><button className="skill-name" disabled={busy} onClick={view}>{skill.name}</button><p title={skill.description}>{skill.description}</p>{skill.warnings.length > 0 && <span className="row-warning" title={skill.warnings.join('\n')}><Icon name="warning"/>{skill.warnings.length} 条格式提醒</span>}</div></div>
    <div className="scope-column">{central ? <span className={`scope-tag ${skill.compatibility !== 'all' ? 'specific' : ''}`}>{skill.compatibility === 'all' ? '通用' : <><ToolIcon id={skill.compatibility as ToolId} small/>{tools.find(t => t.id === skill.compatibility)?.name} 专用</>}</span> : <span className="origin-label">{skill.managed ? '应用管理' : '外部已有'}{skill.linked && ' · 链接'}</span>}</div>
    <div className="deployment-column">{central && !available ? <div className="deployment-icons">{tools.map(t => {
      const match = installed.find(i => i.toolId === t.id && i.libraryId === skill.id)
      const sameName = installed.some(i => i.toolId === t.id && i.name.toLowerCase() === skill.name.toLowerCase())
      return <span key={t.id} className={match ? 'deployed' : 'undeployed'} title={`${t.name}：${match ? '从此仓库安装' : sameName ? '存在同名 Skill，未关联' : '未安装'}`}><ToolIcon id={t.id} small/>{match && <i/>}</span>
    })}</div> : available ? <span className={conflict ? 'installed-state' : 'available-state'}>{conflict ? <><Icon name="check"/>已安装 / 同名</> : '可安装'}</span> : <span className="origin-label">{library.some(s => s.id === skill.libraryId) ? '已关联仓库' : library.some(s => s.source === skill.path) ? '已收入仓库' : '未收录'}</span>}</div>
    <div className="row-actions"><button className="text-button view-button" disabled={busy} onClick={view}>查看</button>{central ? <button className="row-install" disabled={busy || !!conflict} onClick={install}><Icon name={conflict ? 'check' : 'download'}/>{conflict ? '已存在' : '安装'}</button> : <button className="row-install" disabled={busy || skill.linked} onClick={collect}><Icon name="collect"/>收录</button>}
      <details className="row-menu"><summary aria-label={`${skill.name} 更多操作`}><Icon name="more"/></summary><div className="menu-popup"><button disabled={busy} onClick={open}><Icon name="folder"/>打开目录</button>{central ? <label className="menu-label">适用范围<CompatibilitySelect value={skill.compatibility!} tools={tools} disabled={busy} onChange={compatibility}/></label> : <button disabled={busy || skill.linked} onClick={copy}><Icon name="copy"/>复制到其他工具</button>}<button className="danger" disabled={busy || skill.linked} onClick={remove}><Icon name="trash"/>{central ? '移出仓库' : skill.managed ? '卸载 Skill' : '移入回收站'}</button></div></details>
    </div>
  </article>
}
