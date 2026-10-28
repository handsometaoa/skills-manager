import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SkillDetail } from '../../shared/types'
import { ToolIcon } from './Icons'

export function SkillViewer({ detail, toolName, onClose }: { detail: SkillDetail; toolName: string; onClose: () => void }) {
  const [file, setFile] = useState('SKILL.md')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => previous?.focus()
  }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setContent('')
    window.skills.readFile(detail.skill.id, file)
      .then(text => { if (active) setContent(text) })
      .catch(e => { if (active) setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [detail.skill.id, file])
  const markdown = /\.(md|markdown)$/i.test(file)
  const body = file === 'SKILL.md' ? content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '') : content
  return <div className="overlay viewer-overlay"><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="viewer-title" className="skill-viewer" onKeyDown={event => {
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') {
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, [tabindex="0"]') ?? [])
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <div className="viewer-heading"><div><span className="eyebrow">技能浏览</span><h2 id="viewer-title">{detail.skill.name}</h2><div className="viewer-meta"><span><ToolIcon id={detail.skill.toolId} small/>{toolName}</span><span>{detail.skill.toolId === 'library' ? detail.skill.compatibility === 'all' ? '通用' : '工具专用' : detail.skill.managed ? '应用管理' : '外部已有'}</span><span>只读浏览</span></div></div><button aria-label="关闭浏览" onClick={onClose}>×</button></div>
    <div className="viewer-summary"><p>{detail.skill.description}</p><code title={detail.skill.path}>{detail.skill.path}</code>{detail.skill.warnings.map(w => <p className="warning" key={w}>{w}</p>)}</div>
    <div className="viewer-body"><nav className="file-sidebar" aria-label="Skill 文件"><div className="file-heading">文件 <span>{detail.files.length}</span></div>{detail.files.map(item => <button key={item.path} title={`${item.path} · ${item.size} 字节`} className={file === item.path ? 'file-item selected' : 'file-item'} onClick={() => setFile(item.path)}><span>{item.path.includes('/') ? '↳ ' : ''}{item.path}</span></button>)}{detail.truncated && <p className="hint">目录较大，仅显示部分文件。</p>}<p className="hint">跳过内部链接与依赖目录。</p></nav>
    <div className="file-panel"><div className="file-toolbar"><strong title={file}>{file}</strong><div className="view-tabs"><button className={mode === 'preview' ? 'selected' : ''} onClick={() => setMode('preview')}>预览</button><button className={mode === 'source' ? 'selected' : ''} onClick={() => setMode('source')}>源码</button></div></div><div className="file-content" aria-live="polite">{loading ? <div className="reader-status">正在读取文件…</div> : error ? <div className="notice">{error}</div> : mode === 'preview' && markdown ? <div className="markdown-body"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <span className="markdown-link" title={href}>{children}</span>, img: ({ alt }) => <span className="image-placeholder">图片：{alt || '未命名图片'}（请在目录中查看）</span> }}>{body || '此文件暂无正文内容。'}</Markdown></div> : <pre className="source-code"><code>{content || '（空文件）'}</code></pre>}</div></div></div>
    <div className="viewer-footer"><span>浏览内容不会修改文件或执行脚本。</span><button onClick={onClose}>关闭</button></div>
  </section></div>
}
