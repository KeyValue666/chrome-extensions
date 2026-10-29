# Chrome 扩展工作区

一个用于长期维护 **多个 Chrome 扩展（Manifest V3）** 的单仓库工作区。根目录只治理工作区与公共开发工具，每个扩展在 `extensions/<name>/` 内独立成工程、独立构建、独立发布。

## 1. 项目简介

- 仓库用途：以 AI 编码工具（Codex / Claude Code / Cursor 等）为主要开发者，持续新增与维护多个彼此独立的 Chrome 扩展。
- 当前状态：1 个扩展 —— [`xtab`](./extensions/xtab)（新标签页，离线、零网络权限）。
- 核心规范：[`AGENTS.md`](./AGENTS.md)（AI 与人共同遵守）、[`docs/architecture.md`](./docs/architecture.md)（架构与技术决策）。

## 2. 项目定位与设计原则

1. **一扩展一工程**：不同扩展的业务代码、Manifest、权限声明、构建产物绝不混放。
2. **最小权限**：只申请功能确实需要的权限，默认拒绝 `<all_urls>` 与宽泛 Host Permissions。
3. **最小架构**：不预先创建用不到的 Content Script / Popup / Options / Side Panel。
4. **根目录不装业务依赖**：扩展依赖归扩展自己，根目录只留工作区工具与通用脚本。
5. **可验证**：每次改动都能用类型检查、Lint、单测、构建证明没有退化；浏览器行为另行说明人工验证步骤。
6. **规范可执行**：文档里的每条命令都能实际跑通，不写不存在的东西。

## 3. 技术栈

| 类别 | 选型 |
| --- | --- |
| 扩展标准 | Chrome Extension Manifest V3 |
| 语言 | TypeScript（`strict` 模式，基础配置见 `tsconfig.base.json`） |
| 构建 | Vite |
| 包管理与工作区 | pnpm workspace |
| UI | 原生 HTML / CSS / TypeScript（复杂 UI 才考虑 React） |
| 静态检查与格式化 | ESLint（扁平配置）+ Prettier |
| 单元测试 | Vitest |
| 浏览器端验证 | Playwright（按需引入） |

## 4. 环境要求

- **Node.js**：22.x LTS（最低支持 20.19.0，见 `package.json` 的 `engines`）。
- **pnpm**：≥ 10（本仓库固定在 `packageManager` 字段，推荐用 Corepack 启用）。
- **Chrome**：稳定版，用于加载未打包扩展做人工验证。
- 操作系统：Windows / macOS / Linux 均可，仓库统一使用 LF 换行。

```bash
node -v      # 期望 v22.x
corepack enable pnpm
pnpm -v      # 期望 10 以上
```

## 5. 安装依赖

```bash
pnpm install
```

依赖安装后 `pnpm-lock.yaml` 必须提交，保证各扩展构建可复现。

## 6. 工作区目录结构

```
chrome-extensions/
├─ AGENTS.md            # AI 开发总规范（最高优先级约束）
├─ README.md            # 本文件
├─ package.json         # 根工作区脚本 + 公共开发工具依赖
├─ pnpm-workspace.yaml  # 工作区成员声明（extensions/*、packages/*）
├─ tsconfig.base.json   # 扩展 tsconfig 的基础配置
├─ eslint.config.js     # 统一静态检查规则
├─ .prettierrc.json     # 统一格式化规则
├─ scripts/             # 根级通用脚本（如扩展清单）
├─ docs/                # 架构文档、技术决策、公共开发文档
├─ packages/            # 可选：跨扩展复用的公共代码（当前不存在）
└─ extensions/          # 每个子目录 = 一个独立扩展（当前为空）
```

## 7. 如何新增扩展

严格按 `AGENTS.md` 第 9 节流程执行。要点：

1. 命名用小写英文 + 连字符，如 `bilibili-enhancer`、`web-data-collector`；目录名与 `package.json` 的 `name` 保持一致。
2. 先定权限清单，再写代码；每一个权限在扩展 `README.md` 中说明用途。
3. 只创建确实需要的组件目录（background / content / popup / options / sidepanel）。
4. 新增完成后更新根目录 README 第 10 节的扩展清单。

一个扩展最简骨架（按需删减，不要机械照抄）：

```
extensions/<name>/
├─ README.md            # 功能、权限理由、开发与加载方式
├─ package.json         # name/version/scripts/devDeps，name 与目录同名
├─ manifest.json        # MV3 声明，路径指向构建产物
├─ vite.config.ts       # 多入口构建 + 静态资源拷贝
├─ tsconfig.json        # extends "../../tsconfig.base.json"
├─ public/              # 原样拷贝的静态资源（图标等）
├─ src/
│  ├─ background/       # Service Worker
│  ├─ content/          # Content Script
│  ├─ popup/            # 弹出页
│  ├─ options/          # 设置页
│  ├─ sidepanel/        # 侧边栏（确有需求时）
│  ├─ shared/           # 扩展内部共享代码
│  └─ lib/              # 通用工具函数
└─ tests/               # Vitest 单测
```

扩展 `package.json` 至少提供以下脚本，根目录的聚合命令依赖这些脚本名：

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  }
}
```

## 8. 常用命令

根目录脚本（`pnpm run <script>`）：

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装/更新全部工作区依赖 |
| `pnpm run list:ext` | 列出当前所有扩展及其可用脚本 |
| `pnpm run lint` | 对全仓库执行 ESLint 检查 |
| `pnpm run lint:fix` | ESLint 自动修复 |
| `pnpm run format` | Prettier 格式化 |
| `pnpm run format:check` | 检查格式（CI 用） |
| `pnpm run typecheck` | 对定义了 `typecheck` 脚本的扩展全部执行类型检查 |
| `pnpm run test` | 对定义了 `test` 脚本的扩展全部执行单测 |
| `pnpm run build` | 构建所有扩展 |
| `pnpm run check` | 依次执行 lint → format:check → typecheck → test → build |

单个扩展（用包名过滤，包名与目录名一致）：

```bash
pnpm --filter <name> dev        # 开发模式（watch 构建）
pnpm --filter <name> build      # 单独构建
pnpm --filter <name> typecheck  # 单独类型检查
pnpm --filter <name> test       # 单独跑单测
pnpm --filter <name> add -D <pkg>   # 只给该扩展加依赖
```

`pnpm run typecheck / test / build` 使用 `--if-present`，未定义对应脚本的扩展会被跳过，不会报错。

## 9. 在 Chrome 中加载未打包扩展

1. 先构建：`pnpm --filter <name> build`（产物在 `extensions/<name>/dist/`）。
2. 打开 `chrome://extensions/`。
3. 右上角开启「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择 `extensions/<name>/dist` 目录。
5. 改动代码后重新构建，回到扩展页点击该扩展的「重新加载」按钮；页面类改动需刷新目标页面。

注意：必须选 `dist/`，不要选扩展源码根目录。

## 10. 当前扩展清单

| 扩展 | 目录 | 说明 | 主要权限 |
| --- | --- | --- | --- |
| XTab | `extensions/xtab` | 离线可用的新标签页：时钟、聚合搜索、快捷方式分组、壁纸、待办、便签 | `storage`、`favicon` |

新增扩展后在此追加行，并用 `pnpm run list:ext` 校对。

可用 `pnpm run list:ext` 获取最新清单。

## 11. 安全注意事项

- 遵循最小权限原则，新增权限必须在扩展 `README.md` 写清必要性；默认不使用 `<all_urls>`。
- 严禁在代码、Manifest、配置中硬编码 Token、密码、私钥、Cookie；`.env` 已被忽略，仅提交 `.env.example` 占位符。
- `chrome.storage` 不加密，任何敏感数据都不应视其为安全存储。
- 未经用户明确授权，不得将 Cookie、页面内容、用户数据上传到第三方服务。
- 禁止 `eval`、`new Function`、远程脚本加载；MV3 CSP 本身也会拦截，但代码评审同样必须拦住。
- 处理页面数据时防 XSS 与 DOM 注入：优先 `textContent`，必要时显式转义，禁止把外部字符串直接拼进 `innerHTML`。
- 采集类扩展必须遵守目标网站规则与适用法律，并提供明确的开关与退出方式。

## 12. 规范文档入口

- [`AGENTS.md`](./AGENTS.md)：AI 开发总规范，任何任务开始前必读。
- [`docs/architecture.md`](./docs/architecture.md)：分层结构、运行时上下文、构建产物、技术决策。
- 每个扩展的 `README.md`：该扩展的功能、权限理由、开发与验证方式。
