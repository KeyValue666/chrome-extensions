# 项目架构

本仓库是一个 **多 Chrome 扩展（Manifest V3）工作区**：根目录只承担工作区治理与公共开发工具，每个扩展在 `extensions/<name>/` 内独立成工程、独立构建、独立发布。

## 1. 分层结构

```
chrome-extensions/
├─ AGENTS.md            # AI 开发总规范（最高优先级约束）
├─ README.md            # 面向人的入口文档
├─ package.json         # 根工作区脚本与公共开发工具依赖
├─ pnpm-workspace.yaml  # 工作区包声明
├─ tsconfig.base.json   # 扩展 tsconfig 的基础配置
├─ eslint.config.js     # 统一静态检查规则（扩展默认继承）
├─ .prettierrc.json     # 统一格式化规则
├─ scripts/             # 根级通用脚本（非扩展业务代码）
├─ docs/                # 项目级文档、技术决策
├─ packages/            # 可选：跨扩展复用代码（初期不存在）
└─ extensions/          # 每个子目录 = 一个独立扩展
   └─ <extension-name>/
```

职责边界：

| 层级 | 负责 | 不负责 |
| --- | --- | --- |
| 根目录 | 工作区声明、公共 lint/format/类型检查工具、通用脚本、规范文档 | 任何扩展的业务代码、Manifest、权限声明、扩展业务依赖 |
| `extensions/<name>/` | 该扩展的 Manifest、源码、构建配置、测试、依赖、README | 其他扩展的任何内容 |
| `packages/` | 被 ≥2 个扩展真实复用的纯逻辑代码 | 扩展专属业务逻辑、Manifest、DOM 强耦合代码 |

## 2. 扩展运行时上下文

Manifest V3 下一个扩展最多同时存在于三类彼此隔离的执行环境，跨环境访问必须通过显式接口（消息通信 / Storage / 注入），不能共享内存变量。

```
┌───────────────────────────── Chrome 浏览器 ─────────────────────────────┐
│                                                                        │
│  ┌──────────── 网页上下文（MAIN world / 页面 JS） ────────────┐         │
│  │ document、window、页面框架对象、页面自己的 JS              │         │
│  │ ← 这里的 DOM 会被 Content Script 读写，但变量不共享        │         │
│  └───────────────────────────────────────────────────────────┘         │
│              ▲ postMessage / DOM 事件 / 注入脚本                        │
│              │                                                         │
│  ┌───────────┴──── Content Script（ISOLATED world）─────────┐          │
│  │ 与页面共享 DOM，但拥有独立的 JS 全局环境                  │          │
│  │ 可用部分 chrome.* API（runtime、storage、i18n 等）        │          │
│  │ 不能直接用 chrome.tabs / chrome.scripting 等特权 API      │          │
│  └───────────────────────────────────────────────────────────┘          │
│              ▲ chrome.runtime.sendMessage / connect                     │
│              │                                                         │
│  ┌───────────┴──────── 扩展自身上下文 ──────────────────────┐           │
│  │ Background Service Worker（事件驱动、随时可能被终止）     │           │
│  │ Popup / Options / Side Panel（普通扩展页面，随开关销毁）  │           │
│  │ 共享 chrome.* 特权 API、chrome.storage、offscreen document│           │
│  └───────────────────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────────────────┘
```

关键结论（写作与评审代码时必须遵守）：

1. **变量不跨环境共享**。Content Script 读取的页面状态必须通过 DOM 或 `postMessage` 获取；页面无法直接调用扩展 API。
2. **Service Worker 不是常驻进程**。约 30 秒无事件即可能被终止，任何需要跨事件存活的状态必须落到 `chrome.storage` 或 `chrome.storage.session`。
3. **扩展页面生命周期短**。Popup 关闭即销毁，不能作为状态的唯一持有者。
4. **特权操作集中在扩展上下文**。涉及 `tabs`、`scripting`、`cookies`、`downloads` 等权限的逻辑放在 Service Worker 或扩展页面，Content Script 通过消息请求。

## 3. 构建产物结构

每个扩展统一通过 Vite 构建，产物为可直接加载的未打包扩展目录：

```
extensions/<name>/dist/
├─ manifest.json        # 由 manifest.json 或 vite 插件生成，字段必须与产物一致
├─ background.js        # Service Worker 入口（若存在）
├─ content.js           # Content Script 入口（若存在）
├─ popup.html / options.html / sidepanel.html
└─ assets/              # 编译后的 JS/CSS、图标等静态资源
```

约束：

- `manifest.json` 中所有 `js` / `css` / `html` / `icons` / `web_accessible_resources` 路径必须能在 `dist/` 中找到实际文件。
- 产物中不得引用 `http://localhost:*`、未打包源码路径或远程 CDN 脚本（MV3 CSP 禁止远程代码）。
- Service Worker 必须声明 `"type": "module"`（如使用 ESM 打包产物）。

## 4. 公共代码的引入时机

不预先建立 `packages/`。只有满足以下条件才抽取公共包：

1. 至少 2 个扩展存在**语义相同**的逻辑（不是"看起来像"）。
2. 该逻辑与具体扩展的 DOM 结构、权限、UI 无关。
3. 抽取后能显著减少重复维护成本，且不引入额外的构建复杂度。

抽取时在 `packages/<name>/` 建立独立包，包含 `package.json`、`src/`、`README.md` 与测试；扩展以 `workspace:*` 协议依赖它。

## 5. 技术决策记录

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 扩展标准 | Manifest V3 | Chrome 商店唯一可发布标准，MV2 已停止支持 |
| 语言 | TypeScript（strict） | 消息通信、存储结构、权限 API 的错误在编译期暴露 |
| 构建 | Vite | 多入口打包、HMR、生态成熟，产物可直接被 Chrome 加载 |
| 包管理 | pnpm workspace | 严格依赖隔离，避免扩展间依赖串味；磁盘占用低 |
| UI | 原生 HTML/CSS/TS 优先 | 扩展 UI 通常很小，引入框架的收益低于体积与复杂度成本 |
| 静态检查 | ESLint + Prettier | 根目录统一配置，规则集中维护 |
| 单测 | Vitest | 与 Vite 同源，零配置即可测试纯逻辑 |
| E2E | Playwright（按需） | 需要真实扩展加载与页面交互时才引入 |
| Markdown | 不进 Prettier | 中文排版与表格被自动换行后反而不可读 |

新增或推翻以上决策时，先在本文件补充记录，再改代码。
