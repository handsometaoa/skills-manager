import type { ToolId } from '../../../../shared/types'
import { Icon } from '../../components/ui/Icons'
import type { WorkspaceController } from './useWorkspace'

export function WorkspaceToolbar({ workspace }: { workspace: WorkspaceController }) {
  const {
    data,
    tab,
    query,
    setQuery,
    setScope,
    setSelected,
    changeTab,
    isLibrary,
    installed,
    available,
    scope,
  } = workspace
  return (
    <div className="library-toolbar">
      {isLibrary ? (
        <div className="filter-tabs" aria-label="适用范围筛选">
          {(['any', 'all', 'specific'] as const).map((value) => (
            <button
              key={value}
              className={
                (value === 'specific' ? scope !== 'any' && scope !== 'all' : scope === value)
                  ? 'active'
                  : ''
              }
              onClick={() => {
                setScope(value)
                setSelected([])
              }}
            >
              {value === 'any' ? '全部技能' : value === 'all' ? '通用' : '工具专用'}
            </button>
          ))}
          {scope !== 'any' && scope !== 'all' && (
            <select
              aria-label="筛选专用工具"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as ToolId | 'specific')
                setSelected([])
              }}
            >
              <option value="specific">全部工具</option>
              {data.tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className="filter-tabs" aria-label="工具技能视图">
          <button
            className={tab === 'installed' ? 'active' : ''}
            onClick={() => changeTab('installed')}
          >
            已发现 <span>{installed.length}</span>
          </button>
          <button
            className={tab === 'available' ? 'active' : ''}
            onClick={() => changeTab('available')}
          >
            从仓库选择 <span>{available.length}</span>
          </button>
        </div>
      )}
      <div className="search-field">
        <Icon name="search" />
        <input
          aria-label="搜索技能"
          placeholder="搜索名称或描述…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="icon-button" aria-label="清除搜索" onClick={() => setQuery('')}>
            <Icon name="close" />
          </button>
        )}
      </div>
    </div>
  )
}
