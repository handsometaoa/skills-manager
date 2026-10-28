import type { Compatibility, Tool } from '../../../../shared/types'
import { ToolIcon } from '../../components/ui/Icons'
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
    <fieldset className="compatibility-picker" aria-label={label} disabled={disabled}>
      <label className={value === 'all' ? 'chosen' : ''}>
        <input
          type="checkbox"
          checked={value === 'all'}
          aria-label="通用 · 所有工具"
          onChange={(event) => onChange(event.target.checked ? 'all' : [tools[0].id])}
        />
        <span>通用 · 所有工具</span>
      </label>
      <div className="compatibility-options">
        {tools.map((tool) => {
          const checked = value !== 'all' && value.includes(tool.id)
          return (
            <label key={tool.id} className={checked ? 'chosen' : ''}>
              <input
                type="checkbox"
                checked={checked}
                aria-label={`适用 ${tool.name}`}
                onChange={(event) => {
                  const previous = value === 'all' ? [] : value
                  const next = event.target.checked
                    ? [...previous, tool.id]
                    : previous.filter((id) => id !== tool.id)
                  if (next.length) onChange(next)
                }}
              />
              <ToolIcon id={tool.id} small />
              <span>{tool.name}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
