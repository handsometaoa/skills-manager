import { useState } from 'react'
import type { Skill, Tool, ToolId } from '../../../../shared/types'
import { Drawer } from '../../components/ui/Drawer'
import { Icon, ToolIcon } from '../../components/ui/Icons'
import { cleanError } from '../../lib/errors'
import { discoveredBy, supportsTool } from '../../../../shared/compatibility'

export function InstallPanel({
  skills,
  tools,
  installed,
  direct,
  onClose,
  onDone,
}: {
  skills: Skill[]
  tools: Tool[]
  installed: Skill[]
  direct?: Skill
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [targets, setTargets] = useState<ToolId[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const blocked = (id: ToolId) => {
    if (direct && discoveredBy(direct, id)) return '此工具已可发现来源 Skill'
    if (!direct && skills.some((s) => !supportsTool(s.compatibility, id)))
      return '包含不适用于此工具的 Skill'
    if (
      skills.some((s) =>
        installed.some((i) => discoveredBy(i, id) && i.name.toLowerCase() === s.name.toLowerCase()),
      )
    )
      return '已安装或存在同名 Skill'
    if (id === 'zcode' && skills.some((s) => s.description.length > 1024))
      return '描述超出 ZCode 限制'
    if (
      id === 'opencode' &&
      skills.some(
        (s) =>
          s.name.length > 64 ||
          !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.name) ||
          s.metadataName !== s.name ||
          s.description.length > 1024,
      )
    )
      return '不符合 OpenCode 的名称或描述规范'
    return ''
  }
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      if (direct) {
        const candidate = await window.skills.prepareCopy(direct.id)
        await window.skills.install(candidate.path, targets)
      } else
        await window.skills.installLibrary(
          skills.map((s) => s.id),
          targets,
        )
      await onDone()
    } catch (e) {
      setError(cleanError(e))
      setBusy(false)
    }
  }
  return (
    <Drawer
      title={direct ? '复制到其他工具' : '从仓库安装'}
      subtitle="复制到目标目录。共享目录中的副本可能被多个工具读取。"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <span>
            {skills.length} 个 Skill · {targets.length} 个目标
          </span>
          <button
            className="primary"
            disabled={busy || !targets.length}
            onClick={() => void submit()}
          >
            <Icon name="download" />
            {busy ? '正在安装…' : '复制安装'}
          </button>
        </>
      }
    >
      <div className="form-section">
        <span className="step-label">01 / 已选 Skill</span>
        <div className="install-skill-list">
          {skills.map((s) => (
            <div key={s.id}>
              <Icon name="file" />
              <span>{s.name}</span>
              <small>
                {s.compatibility && s.compatibility !== 'all'
                  ? `${s.compatibility.length} 个适用工具`
                  : '通用'}
              </small>
            </div>
          ))}
        </div>
      </div>
      <div className="form-section">
        <span className="step-label">02 / 目标工具</span>
        <div className="install-targets">
          {tools.map((t) => {
            const reason = blocked(t.id)
            return (
              <label
                className={`install-target ${reason ? 'disabled' : ''} ${targets.includes(t.id) ? 'chosen' : ''}`}
                key={t.id}
              >
                <ToolIcon id={t.id} />
                <span>
                  <strong>{t.name}</strong>
                  <small>{reason || t.root}</small>
                </span>
                <input
                  type="checkbox"
                  aria-label={`安装到 ${t.name}`}
                  disabled={busy || !!reason}
                  checked={targets.includes(t.id)}
                  onChange={(e) =>
                    setTargets(
                      e.target.checked ? [...targets, t.id] : targets.filter((id) => id !== t.id),
                    )
                  }
                />
              </label>
            )
          })}
        </div>
      </div>
      <div className="subtle-note">
        <Icon name="copy" />
        <span>
          按目录复制全部文件，同名内容不会覆盖。适用范围不会限制其他工具读取共享目录；同名副本的加载优先级由目标工具决定。安装后请按下方提示刷新。
        </span>
      </div>
      {targets.length > 0 && (
        <div className="install-instructions">
          {tools
            .filter((tool) => targets.includes(tool.id))
            .map((tool) => (
              <p key={tool.id}>
                <strong>{tool.name}：</strong>
                {tool.instructions}
              </p>
            ))}
        </div>
      )}
      {error && (
        <div role="alert" className="notice error">
          <Icon name="warning" />
          {error}
        </div>
      )}
    </Drawer>
  )
}
