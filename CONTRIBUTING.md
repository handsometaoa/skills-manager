# 开发与贡献

本项目使用 Electron、React 和 TypeScript。开始前请阅读 [README](README.md) 和 [架构说明](docs/architecture.md)。

## 本地环境

推荐 Node.js 24（版本见 `.nvmrc`），npm 10+。使用 `npm ci` 安装锁定依赖；开发启动命令为 `npm run dev`。Git 仓库导入依赖系统 Git。

## 修改约定

- 主进程处理文件系统、Git、安装记录和系统对话框。渲染进程只能通过 `window.skills` 使用明确暴露的能力。
- 新增 IPC 方法时，同时更新 `src/shared/api.ts`、`src/shared/ipc.ts`、preload 与主进程 handler，并在主进程校验输入。不能只依赖 TypeScript 类型或界面校验。
- 新工具的用户级目录在 `src/main/adapters/tool-registry.ts` 注册；工具类型、图标和兼容规则也应同步更新。
- 业务流程放进 `services/` 或对应 feature hook，展示组件保持围绕交互和布局组织。
- 使用现有 CSS 和依赖；公共组件放进 `components/`，功能组件放进 `features/`。
- 文件和目录使用 `kebab-case`，React 组件使用 `PascalCase`，hook 使用 `useXxx`。现有数据文件名和结构属于兼容接口，修改前必须考虑已有用户数据。

## 验证

```sh
npm run format
npm run check
npm run build
npm run test:ui
```

`check` 顺序运行格式检查、ESLint、TypeScript 和单元/集成测试。界面测试需要先构建，使用真实 Electron 与 preload、模拟 IPC 数据；不会操作真实 Skill 目录。

安装、卸载、路径读取或数据格式发生变化时，补充临时目录中的集成测试。涉及界面流程时更新 `tests/ui/desktop-qa.cjs`，并检查 `out/qa/` 中的截图。小型文案或样式修改优先使用已有检查，不必为实现细节增加测试。

## 提交内容

请提交源码、文档、测试及必要的锁文件变化。不要提交 `node_modules/`、`out/`、`release*/` 或个人仓库数据。涉及行为、限制或命令变化时同步更新 README。

GitHub Actions 在 Windows 上运行检查、构建和界面测试。macOS 安装包仍需在 macOS 上构建并验证；配置了构建目标不代表已经通过该平台实机测试。
