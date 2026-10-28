import { Icon } from '../../components/ui/Icons'
import { SkillRow } from '../skills/SkillRow'
import type { WorkspaceController } from './useWorkspace'

export function SkillTable({ workspace }: { workspace: WorkspaceController }) {
  const {
    data,
    tab,
    query,
    busy,
    initial,
    setInstalling,
    setDirect,
    selected,
    setSelected,
    refresh,
    run,
    navigate,
    changeTab,
    isLibrary,
    items,
    canSelect,
    selectables,
    toggle,
    view,
    openImport,
    installCurrent,
  } = workspace
  return (
    <section className="skill-table" aria-label={isLibrary ? '仓库技能' : '工具技能'}>
      <div className="table-header">
        <div className="name-column">
          {(isLibrary || tab === 'available') && (
            <input
              type="checkbox"
              aria-label="选择当前列表全部技能"
              disabled={busy || !selectables.length}
              checked={!!selectables.length && selectables.every((s) => selected.includes(s.id))}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? Array.from(new Set([...selected, ...selectables.map((s) => s.id)]))
                    : selected.filter((id) => !selectables.some((s) => s.id === id)),
                )
              }
            />
          )}
          <span>技能 / 描述</span>
        </div>
        <span>{isLibrary || tab === 'available' ? '适用范围' : '管理方式'}</span>
        <span>{isLibrary ? '工具发现状态' : tab === 'available' ? '当前状态' : '仓库状态'}</span>
        <span className="actions-column">操作</span>
      </div>
      {initial ? (
        <div className="skeleton-list">
          {[1, 2, 3].map((n) => (
            <div className="skeleton-row" key={n}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : items.length ? (
        items.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            tools={data.tools}
            installed={data.skills}
            library={data.library}
            selectable={canSelect(skill)}
            selected={selected.includes(skill.id)}
            busy={busy}
            available={!isLibrary && tab === 'available'}
            toggle={() => toggle(skill.id)}
            view={() => view(skill)}
            install={() => {
              if (!isLibrary) installCurrent([skill.id])
              else {
                setDirect(undefined)
                setInstalling([skill])
              }
            }}
            collect={() => openImport(skill)}
            open={() =>
              void run(async () => {
                await window.skills.openPath(skill.path)
              })
            }
            copy={() => {
              setDirect(skill)
              setInstalling([skill])
            }}
            compatibility={(value) =>
              void run(async () => {
                await window.skills.setCompatibility(skill.id, value)
                await refresh()
              }, '适用范围已更新。')
            }
            remove={() =>
              void run(
                async () => {
                  if (skill.toolId === 'library') await window.skills.deleteLibrary(skill.id)
                  else if (skill.managed) await window.skills.uninstall(skill.id)
                  else await window.skills.deleteExternal(skill.id)
                  await refresh()
                  setSelected(selected.filter((id) => id !== skill.id))
                },
                skill.toolId === 'library'
                  ? '已移出仓库，各工具中的副本保留。'
                  : skill.managed
                    ? '卸载完成，原目录旁已保留备份。'
                    : '已移入系统回收站。',
              )
            }
          />
        ))
      ) : (
        <div className="empty-state">
          <span className="empty-illustration">
            <Icon name={isLibrary ? 'library' : tab === 'available' ? 'download' : 'file'} />
            <i />
            <i />
          </span>
          <h2>
            {query
              ? '没有找到匹配的 Skill'
              : isLibrary
                ? '把你的第一个 Skill 收进来'
                : tab === 'available'
                  ? '仓库里还没有适用的 Skill'
                  : '这里还没有安装 Skill'}
          </h2>
          <p>
            {query
              ? '换个关键词，或清除搜索条件。'
              : isLibrary
                ? '从本地、Git 仓库导入，或到工具页面收录已有技能。'
                : tab === 'available'
                  ? '先添加通用技能，或标记为这个工具专用。'
                  : '从仓库选择需要的工作方法，按需复制安装。'}
          </p>
          {!query && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                isLibrary
                  ? openImport()
                  : tab === 'installed'
                    ? changeTab('available')
                    : navigate('library')
              }
            >
              <Icon name={isLibrary ? 'plus' : 'arrow'} />
              {isLibrary ? '添加 Skill' : tab === 'installed' ? '浏览中央仓库' : '前往中央仓库'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
