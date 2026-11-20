# 架构说明

## 进程边界

```text
React 页面与功能组件
        │ window.skills（Api）
        ▼
preload / contextBridge
        │ shared/ipc.ts 中的固定通道
        ▼
main/ipc：校验来源、参数，串行执行文件操作
        ├── services/skill-service：仓库与安装事务
        │      ├── services/skill-parser：格式解析与发现
        │      ├── services/skill-browser：文件浏览与编辑（路径逃逸防护）
        │      ├── services/skill-template：新建 Skill 模板渲染
        │      ├── services/settings-service：settings.json 读写与校验
        │      ├── services/project-service：临时项目扫描与管理
        │      ├── filesystem：文件哈希
        │      ├── storage：记录类型与 JSON 原子替换
        │      └── adapters：工具目录、启停/目录覆盖与项目级路径矩阵
        └── services/source-service：Git 临时目录与可用来源
```

主进程启动入口 `index.ts` 只调用 `bootstrap()`。`bootstrap.ts` 配置兼容数据目录、服务和应用生命周期；`window.ts` 管理窗口选项及页面加载。IPC 模块负责 Electron 特有行为，如目录选择、卸载确认和回收站。

`SkillStore` 是当前 Skill 业务门面，保留事务中的记录快照与回滚逻辑。解析、浏览和哈希操作已经抽成独立模块，避免为了拆文件而将同一个事务分散到多个互相持有状态的对象里。

## 渲染进程

- `main.tsx`：挂载 React，加载字体与样式。
- `App.tsx`：组合布局、工作区和侧边面板；标题栏拖拽区与自绘窗口控制按钮（macOS 使用原生 traffic lights）。
- `features/workspace/useWorkspace.ts`：工作区状态、列表派生数据和用户操作。
- `features/workspace/`：列表、筛选与选择交互。
- `features/library/`：入库、新建模板、适用范围和安装面板。
- `features/project/`：临时项目扫描、收录、删除与安装到项目目录。
- `features/settings/`：主题、仓库位置、Agent 扫描目录与启停。
- `features/skills/`：单条 Skill 操作、文件树、Markdown/高亮源码/编辑。
- `components/`：shadcn/ui 基础组件（Tailwind v4）、图标与面板容器。
- `lib/`：`cn()`、错误清理与平台判断。
- `styles/globals.css`：Tailwind v4 入口与 zinc 主题变量（暗色跟随 `prefers-color-scheme`）。

共享领域模型位于 `shared/types.ts`。IPC API 类型独立放在 `shared/api.ts`，通道名集中在 `shared/ipc.ts`。`Window` 扩展仅放在 renderer 的 `env.d.ts` 中，不污染主进程类型。

## 数据与事务

应用沿用旧数据目录。中央仓库由 `library.json` 描述，实际内容位于 `library/<uuid>/<skill-name>/`；工具安装由 `installations.json` 记录文件清单、哈希、来源及可选 `libraryId`。

`Compatibility` 为 `'all' | ToolId[]`，非空工具列表按注册顺序规范化，重复判断按集合语义进行。加载旧仓库时，将单个工具 ID 转换为单元素列表；下一次保存写入新格式，原文件和 ID 不变。IPC 只接受新格式，工具 ID 列表集中在 `shared/types.ts`，跨进程共用兼容范围判断。

工具适配器分别声明默认安装 `root`、用户级 `discoveryRoots` 和刷新提示。扫描按唯一根目录进行，同一目录中的 Skill 仅返回一个实体，附带 `discoveredBy`（可发现工具）及 `installedBy`（管理器安装目标）。页面、数量、同名冲突和仓库关联均基于发现关系派生，不将共享发现当作多次复制安装。卸载和外部删除作用于底层目录，确认框列出所有受影响的读取工具。

发现关系仅表达已配置的目录读取能力，不表示实际加载成功，也不模拟各工具的同名优先级、权限开关或云端同步。当前仅扫描用户级根目录下的直接子目录。

`deployUpdate` 提供一键下发：将仓库当前版本覆盖同步到所有关联安装副本（哈希比对跳过已同步、备份回滚、刷新管理记录）。入库复制源文件，不移动原件。安装先复制到暂存目录、计算哈希，再创建目标目录并写入记录。批量操作失败时回滚当前批次新增内容。记录以同目录临时文件加重命名方式替换。

所有删除统一由应用回收站处理：完整目录移入 `trash/<uuid>/<skill-name>/`，同目录 `entry.json` 保存原路径、删除时间、仓库或安装关联。跨磁盘移动先复制并校验哈希，再移除来源。还原先检查目录及仓库重复冲突，复制并校验内容、恢复记录后才清理回收站副本。修改过的文件也完整保留。永久删除需经原生确认框确认。仓库记录与工具副本分离，移出仓库不会卸载工具中的内容。

## 安全与已知边界

渲染进程启用 sandbox、context isolation，并关闭 nodeIntegration。preload 只暴露固定 API。IPC 校验主窗口及主 frame，文件读取与编辑限制在已扫描 Skill 的真实目录内（编辑仅允许覆盖已存在的普通文件，原子写回）；预览不执行 HTML 和脚本，也不加载远程图片。

设置保存在 `settings.json`（主题、仓库位置、各工具扫描目录与启停），经内部队列串行写入；`saveSettings` 在全局忙碌互斥锁内执行，仓库迁移不会与安装、收录并发。窗口控制、设置读取与自动更新走轻量直连通道，长任务期间保持响应。

自动更新由 `services/updater-service` 包装 electron-updater：启动后静默检查 GitHub Releases（`package.json` 的 `publish` 字段），状态机推送至渲染进程，下载需用户确认，安装前不覆盖任何用户数据目录。

当前文件操作通过进程内串行处理，不提供多实例写入锁或崩溃后的自动事务恢复。Skill 仍属于可执行指令与资源的集合，文件格式通过校验不代表其内容可信或跨工具运行正确。

## 测试层级

| 目录                 | 验证内容                                     | 依赖                         |
| -------------------- | -------------------------------------------- | ---------------------------- |
| `tests/unit/`        | IPC 参数校验和协议约束                       | Node.js                      |
| `tests/integration/` | 临时目录中的安装、回滚、仓库、文件保护与浏览 | Node.js、真实文件系统        |
| `tests/ui/`          | 列表、筛选、入库、安装、浏览与窗口布局       | Electron、构建产物、模拟 IPC |

UI 测试覆盖目标归属筛选、删除、回收站还原与永久删除；文件系统集成测试覆盖回收站持久化、冲突保护和共享发现恢复。UI 测试不能替代原生系统对话框、真实网络 Git 克隆及 macOS 的实机验证。
