# Skills Manager

基于 Electron、TypeScript、React 的本地 Skill 管理器，支持 Windows 与 macOS。

应用已更名为 Skills Manager。为保留已有仓库、安装记录和设置，数据仍使用原目录：发布版位于系统应用数据目录的 `Skill Manage`，开发版位于 `skill-manage`。应用标识保持不变。

## 开发

需要 Node.js 22+、npm。Git 仓库导入需要系统 Git。

```sh
npm install
npm run dev
```

```sh
npm test          # 临时目录内验证安装、卸载和文件保护
npm run test:ui   # Electron + preload 完整界面流程（模拟数据）
npm run build    # 类型检查与生产构建
npm run pack     # 生成未安装的应用目录
npm run dist     # 当前系统安装包
```

Windows 在 Windows 上构建，macOS DMG 在 macOS 上构建。正式发布需配置 Windows 代码签名与 macOS 签名、公证；当前配置未提供签名凭据。

## 当前功能

- 中央仓库：本地目录或公开 Git 来源先收入仓库，支持批量收录。每份副本保存在 userData/library/<id>/<skill-name>，记录保存在 library.json。
- 从 Claude Code、Codex、ZCode 的工具页面「收录」已有 Skill，可标记为通用或工具专用，原文件保持不变。专用只是用户标记，不是自动兼容性认证。
- 工具页面切换「从仓库选择」，只显示通用和本工具专用的 Skill，勾选后批量复制安装。也可在中央仓库选择多个 Skill，再选择目标工具。
- 同名不同适用范围的 Skill 可在仓库共存；安装目标同名时阻止覆盖。批量安装冲突会回滚本批次新增内容。
- 安装记录通过 libraryId 关联仓库来源；同名外部内容不会被假定为已关联。移出仓库使用系统回收站，不删除工具中已安装的副本。
- 新版保留旧 installations.json 与工具目录，已有内容不会自动搬家；需要时从工具页面收录。
- 本地打包的字体与工具图标，支持键盘焦点、侧边面板、批量选择与小窗口布局。
- 用户级 Skill 扫描、搜索、工具筛选和格式诊断。
- 点击技能名称或「查看」在应用内浏览：Markdown 预览、完整源码、附属文件切换，支持 Escape 关闭。
- 浏览为只读；不执行 HTML 或脚本，不加载远程图片。文本预览上限 1MB，二进制或非 UTF-8 文件提示在外部查看。
- 从本地目录或公开 HTTPS Git 仓库导入，最多扫描四层子目录。
- 复制安装，不覆盖同名目录；多目标安装失败时回滚已创建的目录。
- 保存安装记录及文件 SHA-256，区分应用管理和外部已有的 Skill。
- 已安装行的更多菜单可「复制到其他工具」，保留整个目录与附属文件；来源保持不变，目标成为独立副本。
- 外部已有 Skill 可通过更多菜单「移入回收站」，显示来源工具与实际路径，确认后执行。当前不删除链接目录。
- 卸载前确认；文件被修改、新增或删除时停止卸载。
- 卸载后在原目录旁保留 `.removed-<uuid>` 备份；手动将其改回原 Skill 目录名即可恢复为外部 Skill。备份不会自动清理。
- 默认启用 Electron sandbox、context isolation，并限制 IPC 来源与可操作路径。

## 安装目录

| 工具 | 用户级目录 |
| --- | --- |
| Claude Code | `~/.claude/skills` |
| Codex | `~/.agents/skills` |
| ZCode | `~/.zcode/skills` |

`~` 通过系统用户主目录解析。扫描结果代表文件存在，不代表工具已安装或 Skill 已启用。Codex 当前只处理 `.agents/skills`，尚未兼容历史 `.codex/skills` 路径。

ZCode 规则依据 https://zcode.z.ai/cn/docs/skill ：校验 name / description，描述超 1024 字符阻止安装，正文超 100KB 提示警告。安装后请在 ZCode 设置 → 技能刷新并确认启用。

## 边界

当前不支持覆盖更新、项目级安装、启停控制、链接安装、私有仓库认证、自动更新或远程主机。仓库中的脚本不会被执行，子模块不会自动下载。Skill 内部的符号链接会阻止安装。

安装记录保存在 Electron `userData/installations.json`。Git 来源记录仓库 URL 与子目录，当前未保存提交版本；Git 克隆的临时目录会在正常退出时尽力清理。
