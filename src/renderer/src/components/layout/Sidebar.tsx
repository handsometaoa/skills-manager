import { Icon, ToolIcon } from '../ui/Icons'
import type { WorkspaceController } from '../../features/workspace/useWorkspace'
import { discoveredBy } from '../../../../shared/compatibility'

export function Sidebar({
  data,
  page,
  isLibrary,
  navigate,
}: Pick<WorkspaceController, 'data' | 'page' | 'isLibrary' | 'navigate'>) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <span />
          <span />
          <span />
          <span />
        </span>
        <div>
          Skills Manager<small>个人技能工作台</small>
        </div>
      </div>
      <div className="nav-caption">工作空间</div>
      <nav aria-label="工作空间">
        <button
          className={`nav-item ${isLibrary ? 'active' : ''}`}
          aria-current={isLibrary ? 'page' : undefined}
          onClick={() => navigate('library')}
        >
          <ToolIcon id="library" small />
          <span>中央仓库</span>
          <b>{data.library.length}</b>
        </button>
      </nav>
      <div className="nav-caption tool-caption">
        安装目标 <span>{data.tools.length}</span>
      </div>
      <nav className="tool-navigation" aria-label="AI 工具">
        {data.tools.map((t) => (
          <button
            key={t.id}
            className={`nav-item ${page === t.id ? 'active' : ''}`}
            aria-current={page === t.id ? 'page' : undefined}
            onClick={() => navigate(t.id)}
          >
            <ToolIcon id={t.id} small />
            <span>{t.name}</span>
            <b>{data.skills.filter((s) => discoveredBy(s, t.id)).length}</b>
          </button>
        ))}
      </nav>
      <div className="sidebar-guide">
        <Icon name="copy" />
        <strong>一处收藏，按需安装</strong>
        <p>仓库保存副本，共享目录可供多个工具读取。</p>
      </div>
      <div className="sidebar-bottom">
        <span className="connection-dot" />
        本地存储 <span>v0.3</span>
      </div>
    </aside>
  )
}
