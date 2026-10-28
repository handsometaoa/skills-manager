import { SkillTable } from './features/workspace/SkillTable'
import { WorkspaceToolbar } from './features/workspace/WorkspaceToolbar'
import { SkillViewer } from './features/skills/SkillViewer'
import { Icon, ToolIcon } from './components/ui/Icons'
import { ImportPanel } from './features/library/ImportPanel'
import { InstallPanel } from './features/library/InstallPanel'
import { Sidebar } from './components/layout/Sidebar'
import { useWorkspace } from './features/workspace/useWorkspace'
import { discoveredBy } from '../../shared/compatibility'

export function App() {
  const workspace = useWorkspace()
  const {
    data,
    page,
    tab,
    busy,
    message,
    setMessage,
    viewing,
    setViewing,
    importing,
    setImporting,
    collect,
    setCollect,
    installing,
    setInstalling,
    direct,
    setDirect,
    selected,
    setSelected,
    showDiagnostics,
    setShowDiagnostics,
    refresh,
    run,
    navigate,
    changeTab,
    tool,
    isLibrary,
    installed,
    items,
    chosen,
    openImport,
    installCurrent,
    completeImport,
    completeInstall,
  } = workspace
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        跳至内容
      </a>
      <Sidebar data={data} page={page} isLibrary={isLibrary} navigate={navigate} />
      <div className="app-main">
        <header className="topbar">
          <div>
            我的工作空间<span>/</span>
            <strong>{isLibrary ? '中央仓库' : tool?.name}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-indicator">
              <span className="connection-dot" />
              仅存储于本机
            </span>
            <button
              className={`icon-button ${busy ? 'is-loading' : ''}`}
              aria-label="刷新列表"
              title="重新扫描文件"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              <Icon name="refresh" />
            </button>
          </div>
        </header>
        <main id="workspace" className="workspace" tabIndex={-1} aria-busy={busy}>
          <section className="workspace-heading">
            <div className="heading-copy">
              <div className="section-label">
                {isLibrary ? '你的能力，集中收藏' : '独立安装，随时取用'}
              </div>
              <h1>
                {!isLibrary && <ToolIcon id={page} />} {isLibrary ? '中央仓库' : tool?.name}
                <span className="heading-count">
                  {isLibrary ? data.library.length : installed.length}
                </span>
              </h1>
              <p>
                {isLibrary
                  ? '收好每一份工作方法，再交给合适的工具。'
                  : '从中央仓库挑选技能，复制到这个工具的用户目录。'}
              </p>
            </div>
            <div className="heading-actions">
              {isLibrary ? (
                <>
                  <button
                    className="quiet-button"
                    disabled={busy}
                    title={data.libraryRoot}
                    onClick={() =>
                      void run(async () => {
                        await window.skills.openPath(data.libraryRoot)
                      })
                    }
                  >
                    <Icon name="folder" />
                    打开仓库
                  </button>
                  <button className="primary" disabled={busy} onClick={() => openImport()}>
                    <Icon name="plus" />
                    添加 Skill
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="quiet-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await window.skills.openPath(tool!.root)
                      })
                    }
                  >
                    <Icon name="folder" />
                    打开目录
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => changeTab('available')}
                  >
                    <Icon name="plus" />
                    从仓库安装
                  </button>
                </>
              )}
            </div>
          </section>
          {isLibrary && (
            <section className="distribution-strip" aria-label="安装概览">
              <div className="distribution-intro">
                <span className="flow-mark">
                  <Icon name="library" />
                </span>
                <div>
                  <strong>一个仓库，多个工作伙伴</strong>
                  <span>通用能力与工具专用 Skill 都能收录</span>
                </div>
              </div>
              <div className="distribution-tools">
                {data.tools.map((t) => (
                  <button key={t.id} onClick={() => navigate(t.id)}>
                    <ToolIcon id={t.id} small />
                    <span>
                      {t.name}
                      <small>
                        {data.skills.filter((s) => discoveredBy(s, t.id)).length} 个可发现
                      </small>
                    </span>
                    <Icon name="arrow" />
                  </button>
                ))}
              </div>
            </section>
          )}
          {!isLibrary && (
            <>
              <div className="tool-path">
                <span className="path-label">用户目录</span>
                <code>{tool?.root}</code>
                <span>复制安装</span>
              </div>
              <div className="tool-discovery-note">
                <span>{tool?.instructions}</span>
                <details>
                  <summary>查看扫描目录与共享关系</summary>
                  {tool?.discoveryRoots.map((root) => (
                    <p key={root}>
                      <code>{root}</code>
                      <span>
                        {data.tools
                          .filter((t) => t.discoveryRoots.includes(root))
                          .map((t) => t.name)
                          .join('、')}
                      </span>
                    </p>
                  ))}
                  <small>
                    可发现表示目录中存在文件，不代表已启用或实际加载。同名技能的优先级由目标工具决定。
                  </small>
                </details>
              </div>
            </>
          )}
          {message && (
            <div
              role={message.error ? 'alert' : 'status'}
              className={`notice ${message.error ? 'error' : 'success'}`}
            >
              <Icon name={message.error ? 'warning' : 'check'} />
              <span>{message.text}</span>
              <button
                className="icon-button"
                aria-label="关闭提示"
                onClick={() => setMessage(null)}
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          <WorkspaceToolbar workspace={workspace} />
          <SkillTable workspace={workspace} />
          <div className="list-footer">
            <span>
              {items.length} 个 Skill
              {isLibrary
                ? ` · ${data.library.filter((s) => s.compatibility === 'all').length} 个通用`
                : ' · 用户级可发现'}
            </span>
            <span>
              <span className="connection-dot" />
              仓库与工具副本不自动同步
            </span>
          </div>
          {data.diagnostics.length > 0 && (
            <section className="diagnostics">
              <button className="text-button" onClick={() => setShowDiagnostics(!showDiagnostics)}>
                <Icon name="warning" />
                {data.diagnostics.length} 条扫描诊断{showDiagnostics ? ' · 收起' : ' · 展开'}
              </button>
              {showDiagnostics && (
                <div>
                  {data.diagnostics.map((d, i) => (
                    <p key={i}>{d}</p>
                  ))}
                </div>
              )}
            </section>
          )}
          {selected.length > 0 && (isLibrary || tab === 'available') && (
            <div className="selection-bar">
              <span className="selection-number">{selected.length}</span>
              <strong>个 Skill 已选择</strong>
              <button className="text-button" disabled={busy} onClick={() => setSelected([])}>
                取消选择
              </button>
              <button
                className="primary"
                disabled={busy || !chosen.length}
                onClick={() => {
                  if (isLibrary) {
                    setDirect(undefined)
                    setInstalling(chosen)
                  } else installCurrent()
                }}
              >
                <Icon name="download" />
                {busy ? '正在安装…' : isLibrary ? '选择安装目标' : `安装到 ${tool?.name}`}
              </button>
            </div>
          )}
        </main>
      </div>
      {importing && (
        <ImportPanel
          tools={data.tools}
          collect={collect}
          onClose={() => {
            setImporting(false)
            setCollect(undefined)
          }}
          onDone={completeImport}
        />
      )}
      {installing && (
        <InstallPanel
          skills={installing}
          tools={data.tools}
          installed={data.skills}
          direct={direct}
          onClose={() => {
            setInstalling(null)
            setDirect(undefined)
          }}
          onDone={completeInstall}
        />
      )}
      {viewing && (
        <SkillViewer
          detail={viewing}
          toolName={
            viewing.skill.toolId === 'library'
              ? '中央仓库'
              : (data.tools.find((t) => t.id === viewing.skill.toolId)?.name ?? '')
          }
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
