import { useState } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { DeployPlan, Skill, Tool } from '../../../../shared/types'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Label } from '../../components/ui/label'
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group'
import { ToolIcon } from '../../components/ui/Icons'

export function DeployDialog({
  skill,
  plan,
  tools,
  busy,
  onClose,
  onConfirm,
}: {
  skill: Skill
  plan: DeployPlan
  tools: Tool[]
  busy: boolean
  onClose: () => void
  onConfirm: (overwritePaths: string[]) => void
}) {
  const [choices, setChoices] = useState<Record<string, 'skip' | 'overwrite'>>({})
  const overwritePaths = plan.conflicts
    .filter((copy) => copy.overwritable && choices[copy.path] === 'overwrite')
    .map((copy) => copy.path)
  const changed = plan.linked.filter((copy) => copy.status === 'changed').length
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">下发更新：{skill.name}</DialogTitle>
          <DialogDescription className="text-xs">
            仓库当前版本将覆盖已关联副本中的本地修改。内容已同步的副本会自动跳过。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/60 rounded-lg p-3 text-xs">
            已关联 {plan.linked.length} 个副本，其中 {changed} 个需要更新；
            {plan.linked.some((copy) => copy.status === 'missing') &&
              ` ${plan.linked.filter((copy) => copy.status === 'missing').length} 个目标已不存在；`}
            {plan.conflicts.length
              ? `发现 ${plan.conflicts.length} 个未关联主仓库的同名副本。`
              : '没有未关联主仓库的同名副本。'}
          </div>
          {plan.conflicts.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <TriangleAlert className="size-4 text-amber-500" />
                同名副本处理
              </h3>
              <p className="text-muted-foreground text-xs">
                默认跳过。选择覆盖会丢弃该副本的本地修改，并自动关联到主仓库。
              </p>
              <div className="space-y-2">
                {plan.conflicts.map((copy) => (
                  <div key={copy.path} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <code className="min-w-0 flex-1 truncate text-xs" title={copy.path}>
                        {copy.path}
                      </code>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {copy.managed ? '应用管理' : '外部已有'}
                        {copy.identical ? ' · 内容相同' : ''}
                        {!copy.overwritable ? ' · 链接目录，不可覆盖' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {copy.toolIds.map((id) => (
                        <ToolIcon key={id} id={id} small />
                      ))}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {tools
                          .filter((tool) => copy.toolIds.includes(tool.id))
                          .map((t) => t.name)
                          .join('、')}
                      </span>
                    </div>
                    <RadioGroup
                      className="grid-cols-2"
                      value={copy.overwritable ? (choices[copy.path] ?? 'skip') : 'skip'}
                      disabled={!copy.overwritable}
                      onValueChange={(value) =>
                        setChoices((current) => ({
                          ...current,
                          [copy.path]: value as 'skip' | 'overwrite',
                        }))
                      }
                    >
                      {(
                        [
                          ['skip', '跳过（保留本地内容）'],
                          ['overwrite', '覆盖并关联主仓库'],
                        ] as const
                      ).map(([value, label]) => (
                        <Label key={value} className="flex items-center gap-2 text-xs font-normal">
                          <RadioGroupItem value={value} disabled={!copy.overwritable} />
                          {label}
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy} onClick={() => onConfirm(overwritePaths)}>
            <RefreshCw />
            {busy ? '正在下发…' : '确认下发'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
