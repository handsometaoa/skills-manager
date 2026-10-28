import { CompatibilitySelect } from './CompatibilitySelect'
import { cleanError } from '../../lib/errors'
import { useState } from 'react'
import type { Candidate, Compatibility, Skill, Tool } from '../../../../shared/types'
import { Drawer } from '../../components/ui/Drawer'
import { Icon, ToolIcon } from '../../components/ui/Icons'

export function ImportPanel({
  tools,
  collect,
  onClose,
  onDone,
}: {
  tools: Tool[]
  collect?: Skill
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [method, setMethod] = useState<'local' | 'git'>('local')
  const [url, setUrl] = useState('')
  const [items, setItems] = useState<Candidate[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [compatibility, setCompatibility] = useState<Compatibility>(
    collect && collect.toolId !== 'library' ? [collect.toolId] : 'all',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const load = async () => {
    setError('')
    setBusy(true)
    try {
      if (method === 'git') {
        const parsed = new URL(url.trim())
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
          throw new Error('请输入不含凭据的 HTTPS 仓库地址')
      }
      const result =
        method === 'local'
          ? await window.skills.pickLocal()
          : await window.skills.importGit(url.trim())
      if (result) {
        setItems(result)
        setChosen(result.map((c) => c.path))
        setLoaded(true)
      }
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }
  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      if (collect) await window.skills.collectSkill(collect.id, compatibility)
      else await window.skills.addToLibrary(chosen, compatibility)
      await onDone()
    } catch (e) {
      setError(cleanError(e))
      setBusy(false)
    }
  }
  return (
    <Drawer
      title={collect ? '收入中央仓库' : '添加到中央仓库'}
      subtitle={
        collect
          ? '保存一份独立副本，原工具中的文件保持不变。'
          : '先保存，再按需分发给你的 AI 工具。'
      }
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <span>{collect ? '复制收录，保留原文件' : `已选择 ${chosen.length} 个 Skill`}</span>
          <button
            className="primary"
            disabled={busy || (!collect && !chosen.length)}
            onClick={() => void submit()}
          >
            {busy ? '正在收录…' : '收入仓库'}
            <Icon name="arrow" />
          </button>
        </>
      }
    >
      {collect ? (
        <div className="collect-preview">
          <ToolIcon id={collect.toolId} />
          <div>
            <strong>{collect.name}</strong>
            <p>{collect.description}</p>
            <code>{collect.path}</code>
          </div>
        </div>
      ) : (
        <>
          <div className="form-section">
            <span className="step-label">01 / 来源</span>
            <div className="segmented" aria-label="导入方式">
              <button
                disabled={busy}
                className={method === 'local' ? 'selected' : ''}
                onClick={() => setMethod('local')}
              >
                <Icon name="folder" />
                本地目录
              </button>
              <button
                disabled={busy}
                className={method === 'git' ? 'selected' : ''}
                onClick={() => setMethod('git')}
              >
                <Icon name="git" />
                Git 仓库
              </button>
            </div>
            {method === 'local' ? (
              <button className="drop-zone" disabled={busy} onClick={() => void load()}>
                <span className="import-symbol">
                  <Icon name="folder" />
                </span>
                <strong>{busy ? '正在读取…' : '选择 Skill 文件夹'}</strong>
                <span>支持单个 Skill，或包含多个 Skill 的目录</span>
                <span className="text-link">
                  浏览本地文件 <Icon name="arrow" />
                </span>
              </button>
            ) : (
              <div className="git-form">
                <label htmlFor="git-url">仓库地址</label>
                <input
                  id="git-url"
                  placeholder="https://github.com/owner/repository"
                  value={url}
                  disabled={busy}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="hint">公开 HTTPS 仓库，需要系统已安装 Git。</p>
                <button disabled={busy || !url.trim()} onClick={() => void load()}>
                  <Icon name="git" />
                  {busy ? '正在克隆并扫描…' : '读取仓库'}
                </button>
              </div>
            )}
          </div>
          {loaded && (
            <div className="form-section">
              <div className="section-row">
                <span className="step-label">02 / 选择 Skill</span>
                {items.length > 0 && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      setChosen(chosen.length === items.length ? [] : items.map((c) => c.path))
                    }
                  >
                    {chosen.length === items.length ? '取消全选' : '全选'}
                  </button>
                )}
              </div>
              {!items.length ? (
                <div className="inline-empty">未找到有效的 SKILL.md。请检查目录及必填字段。</div>
              ) : (
                <div className="candidate-list">
                  {items.map((c) => (
                    <label className="candidate-option" key={c.path}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(c.path)}
                        disabled={busy}
                        onChange={(e) =>
                          setChosen(
                            e.target.checked
                              ? [...chosen, c.path]
                              : chosen.filter((p) => p !== c.path),
                          )
                        }
                      />
                      <span>
                        <strong>{c.name}</strong>
                        <small>{c.description}</small>
                        {c.warnings.map((w) => (
                          <small className="warning" key={w}>
                            {w}
                          </small>
                        ))}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <div className="form-section">
        <span className="step-label">
          {collect ? '适用范围' : loaded ? '03 / 适用范围' : '02 / 适用范围'}
        </span>
        <h3>通用，或选择多个适用工具</h3>
        <p className="form-description">
          可以同时选择多个工具。Skill 只会出现在所选工具的仓库安装列表里，适用范围可随时修改。
        </p>
        <CompatibilitySelect
          value={compatibility}
          onChange={setCompatibility}
          tools={tools}
          disabled={busy}
        />
        <div className="subtle-note">
          <Icon name="file" />
          <span>
            适用范围用于筛选安装列表，无法限制工具读取共享目录。应用保留原始内容，不会自动转换工具专用指令。
          </span>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          <Icon name="warning" />
          {error}
        </div>
      )}
    </Drawer>
  )
}
