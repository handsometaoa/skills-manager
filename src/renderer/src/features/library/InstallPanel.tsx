import { useState } from 'react'
import type { Skill, Tool, ToolId } from '../../../../shared/types'
import { SheetPanel } from '../../components/ui/SheetPanel'
import { FileText, Download, TriangleAlert } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { ToolIcon } from '../../components/ui/Icons'
import { cleanError } from '../../lib/errors'
import { discoveredBy, supportsTool } from '../../../../shared/compatibility'
import { cn } from '@/lib/utils'

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
    <SheetPanel
      title={direct ? '复制到其他工具' : '从仓库安装'}
      subtitle="复制到目标目录。"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <span className="text-muted-foreground text-sm">
            {skills.length} 个 Skill · {targets.length} 个目标
          </span>
          <Button disabled={busy || !targets.length} onClick={() => void submit()}>
            <Download />
            {busy ? '正在安装…' : '复制安装'}
          </Button>
        </>
      }
    >
      <section className="space-y-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide">
          01 / 已选 Skill
        </span>
        <div className="divide-y overflow-hidden rounded-xl border">
          {skills.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
              <small className="text-muted-foreground text-xs">
                {s.compatibility && s.compatibility !== 'all'
                  ? `${s.compatibility.length} 个适用工具`
                  : '通用'}
              </small>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide">
          02 / 目标工具
        </span>
        <div className="install-targets grid grid-cols-1 gap-2">
          {tools.map((t) => {
            const reason = blocked(t.id)
            const chosen = targets.includes(t.id)
            return (
              <Label
                key={t.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-normal',
                  reason ? 'opacity-50' : 'cursor-pointer hover:bg-accent/60',
                  chosen && 'border-primary/40 bg-primary/5',
                )}
              >
                <ToolIcon id={t.id} />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{t.name}</strong>
                  <small className="text-muted-foreground block truncate text-xs">
                    {reason || t.root}
                  </small>
                </span>
                <Checkbox
                  aria-label={`安装到 ${t.name}`}
                  disabled={busy || !!reason}
                  checked={chosen}
                  onCheckedChange={(checked) =>
                    setTargets(checked ? [...targets, t.id] : targets.filter((id) => id !== t.id))
                  }
                />
              </Label>
            )
          })}
        </div>
      </section>
      {targets.length > 0 && (
        <div className="space-y-1.5 rounded-lg border p-3">
          {tools
            .filter((tool) => targets.includes(tool.id))
            .map((tool) => (
              <p key={tool.id} className="text-xs">
                <strong>{tool.name}：</strong>
                <span className="text-muted-foreground">{tool.instructions}</span>
              </p>
            ))}
        </div>
      )}
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
