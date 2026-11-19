import { CompatibilitySelect } from './CompatibilitySelect'
import { cleanError } from '../../lib/errors'
import { useState } from 'react'
import type { Candidate, Compatibility, Skill, Tool } from '../../../../shared/types'
import { SheetPanel } from '../../components/ui/SheetPanel'
import { ArrowRight, FolderOpen, GitBranch, TriangleAlert } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { ToolIcon } from '../../components/ui/Icons'
import { cn } from '@/lib/utils'

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
    <SheetPanel
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
          <span className="text-muted-foreground text-sm">
            {collect ? '复制收录，保留原文件' : `已选择 ${chosen.length} 个 Skill`}
          </span>
          <Button disabled={busy || (!collect && !chosen.length)} onClick={() => void submit()}>
            {busy ? '正在收录…' : '收入仓库'}
            <ArrowRight />
          </Button>
        </>
      }
    >
      {collect ? (
        <div className="collect-preview flex items-start gap-3 rounded-xl border bg-card p-3">
          <ToolIcon id={collect.toolId} />
          <div className="min-w-0">
            <strong className="text-sm">{collect.name}</strong>
            <p className="text-muted-foreground truncate-2 text-xs">{collect.description}</p>
            <code className="text-muted-foreground mt-1 block truncate text-xs">
              {collect.path}
            </code>
          </div>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <span className="text-muted-foreground text-xs font-medium tracking-wide">
              01 / 来源
            </span>
            <div className="grid grid-cols-2 gap-2" aria-label="导入方式">
              {(
                [
                  ['local', FolderOpen, '本地目录'],
                  ['git', GitBranch, 'Git 仓库'],
                ] as const
              ).map(([value, Icon, text]) => (
                <Button
                  key={value}
                  variant="outline"
                  disabled={busy}
                  className={cn(method === value && 'border-primary/60 bg-primary/5')}
                  onClick={() => setMethod(value)}
                >
                  <Icon />
                  {text}
                </Button>
              ))}
            </div>
            {method === 'local' ? (
              <button
                className="drop-zone hover:bg-accent/60 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 transition-colors disabled:opacity-50"
                disabled={busy}
                onClick={() => void load()}
              >
                <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
                  <FolderOpen className="size-5" />
                </span>
                <strong className="text-sm">{busy ? '正在读取…' : '选择 Skill 文件夹'}</strong>
                <span className="text-muted-foreground text-xs">
                  支持单个 Skill，或包含多个 Skill 的目录
                </span>
                <span className="text-primary inline-flex items-center gap-1 text-xs">
                  浏览本地文件 <ArrowRight className="size-3" />
                </span>
              </button>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="git-url">仓库地址</Label>
                <Input
                  id="git-url"
                  placeholder="https://github.com/owner/repository"
                  value={url}
                  disabled={busy}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  公开 HTTPS 仓库，需要系统已安装 Git。
                </p>
                <Button
                  variant="outline"
                  disabled={busy || !url.trim()}
                  onClick={() => void load()}
                >
                  <GitBranch />
                  {busy ? '正在克隆并扫描…' : '读取仓库'}
                </Button>
              </div>
            )}
          </section>
          {loaded && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium tracking-wide">
                  02 / 选择 Skill
                </span>
                {items.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() =>
                      setChosen(chosen.length === items.length ? [] : items.map((c) => c.path))
                    }
                  >
                    {chosen.length === items.length ? '取消全选' : '全选'}
                  </Button>
                )}
              </div>
              {!items.length ? (
                <div className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
                  未找到有效的 SKILL.md。请检查目录及必填字段。
                </div>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {items.map((c) => (
                    <Label
                      className="candidate-option hover:bg-accent/60 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-normal"
                      key={c.path}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={chosen.includes(c.path)}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          setChosen(
                            checked ? [...chosen, c.path] : chosen.filter((p) => p !== c.path),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <strong className="block text-sm">{c.name}</strong>
                        <small className="text-muted-foreground truncate-2 block text-xs">
                          {c.description}
                        </small>
                        {c.warnings.map((w) => (
                          <small className="text-amber-500 block text-xs" key={w}>
                            {w}
                          </small>
                        ))}
                      </span>
                    </Label>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
      <section className="space-y-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide">
          {collect ? '适用范围' : loaded ? '03 / 适用范围' : '02 / 适用范围'}
        </span>
        <h3 className="text-sm font-medium">通用，或选择多个适用工具</h3>
        <CompatibilitySelect
          value={compatibility}
          onChange={setCompatibility}
          tools={tools}
          disabled={busy}
        />
      </section>
      {error && (
        <div
          role="alert"
          className="text-destructive flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}
    </SheetPanel>
  )
}
