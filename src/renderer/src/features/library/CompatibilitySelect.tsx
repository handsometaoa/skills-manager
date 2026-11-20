import type { Compatibility, Tool } from '../../../../shared/types'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { ToolIcon } from '../../components/ui/Icons'
import { cn } from '@/lib/utils'

export function CompatibilitySelect({
  value,
  onChange,
  tools,
  disabled = false,
  label = '适用工具',
}: {
  value: Compatibility
  onChange: (value: Compatibility) => void
  tools: Tool[]
  disabled?: boolean
  label?: string
}) {
  return (
    <fieldset className="compatibility-picker space-y-2" aria-label={label} disabled={disabled}>
      <Label
        className={cn(
          'hover:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm font-normal',
          value === 'all' && 'border-primary/40 bg-primary/5',
        )}
      >
        <Checkbox
          checked={value === 'all'}
          aria-label="通用 · 所有工具"
          // With every agent disabled there is nothing to fall back to, so the
          // checkbox stays on 通用 instead of producing an invalid selection.
          onCheckedChange={(checked) =>
            onChange(checked ? 'all' : tools[0] ? [tools[0].id] : 'all')
          }
        />
        <span>通用 · 所有工具</span>
      </Label>
      <div className="grid grid-cols-2 gap-2">
        {tools.map((tool) => {
          const checked = value !== 'all' && value.includes(tool.id)
          return (
            <Label
              key={tool.id}
              className={cn(
                'hover:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm font-normal',
                checked && 'border-primary/40 bg-primary/5',
              )}
            >
              <Checkbox
                checked={checked}
                aria-label={`适用 ${tool.name}`}
                onCheckedChange={(checked) => {
                  const previous = value === 'all' ? [] : value
                  const next = checked
                    ? [...previous, tool.id]
                    : previous.filter((id) => id !== tool.id)
                  if (next.length) onChange(next)
                }}
              />
              <ToolIcon id={tool.id} small />
              <span className="truncate">{tool.name}</span>
            </Label>
          )
        })}
      </div>
    </fieldset>
  )
}
