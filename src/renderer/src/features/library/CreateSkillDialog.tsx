import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Compatibility, CreateSkillInput, Tool } from '../../../../shared/types'
import { cleanError } from '../../lib/errors'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { CompatibilitySelect } from './CompatibilitySelect'

const NAME_HINT = '字母、数字、短横线或下划线，需以字母或数字开头'

export function CreateSkillDialog({
  target,
  tools,
  onClose,
  onDone,
}: {
  target: 'library' | Tool
  tools: Tool[]
  onClose: () => void
  onDone: (name: string) => Promise<void>
}) {
  const toLibrary = target === 'library'
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [compatibility, setCompatibility] = useState<Compatibility>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name.trim())
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const input: CreateSkillInput = toLibrary
        ? { name, description, target: 'library', compatibility }
        : { name, description, target: target.id }
      await window.skills.createSkill(input)
      await onDone(name.trim())
    } catch (e) {
      setError(cleanError(e))
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            {toLibrary ? '新建 Skill 模板' : `新建 Skill 到 ${target.name}`}
          </DialogTitle>
          <DialogDescription>
            {toLibrary
              ? '创建含 SKILL.md 的模板目录，之后可从仓库安装到各工具。'
              : `将直接创建在 ${target.root}，以外部 Skill 形式被扫描。`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="skill-name">Skill 名称（即目录名）</Label>
            <Input
              id="skill-name"
              placeholder="例如 code-review"
              value={name}
              disabled={busy}
              aria-invalid={!!name && !valid}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{NAME_HINT}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skill-description">描述（触发条件，必填）</Label>
            <Textarea
              id="skill-description"
              placeholder="一句话说明这个 Skill 做什么、什么时候使用。"
              value={description}
              disabled={busy}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{description.trim().length}/1024</p>
          </div>
          {toLibrary && (
            <div className="space-y-1.5">
              <Label>适用范围</Label>
              <CompatibilitySelect
                value={compatibility}
                onChange={setCompatibility}
                tools={tools}
                disabled={busy}
              />
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="text-destructive rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
            >
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !valid || !description.trim()} onClick={() => void submit()}>
            <Sparkles />
            {busy ? '正在创建…' : '创建模板'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
