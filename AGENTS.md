# AGENTS.md — 多 Chrome 扩展工作区 AI 开发总规范

本文件是本仓库的**最高优先级开发约定**，对所有 AI 编码工具与人工作业同时生效。任何任务开始前必须先读完本文件；与本文件冲突时必须先说明再行动。

配套文档：`README.md`（使用说明与命令）、`docs/architecture.md`（分层结构与技术决策）。

---

## 0. 工作区事实

- 仓库类型：pnpm workspace 单仓库，托管多个**互不相关**的 Chrome 扩展。
- 当前状态：已有 [`extensions/xtab`](./extensions/xtab)（新标签页，离线、零网络请求）。除它之外的扩展还不存在，不要假设。
- 技术栈：Manifest V3 + TypeScript（strict）+ Vite + pnpm workspace + ESLint/Prettier + Vitest（+ Playwright 按需）。
- Node.js：22.x LTS（最低 20.19.0）；pnpm ≥ 10（版本锁定在根 `packageManager` 字段）。
- 根目录**不放任何扩展业务代码与业务依赖**。

---

## 1. AI 执行规则

1. 开始任何任务前，先读根目录 `AGENTS.md`；新增/修改某个扩展时，再读该扩展目录下的 `AGENTS.md`（若存在）与 `README.md`。
2. 任务涉及公共包时，同时阅读 `packages/<name>/README.md` 与相关规范。
3. **先理解现有实现，再动手修改**。改之前至少读清楚相关入口文件、Manifest、构建配置。
4. 优先修改现有代码，禁止无必要地重写整个工程、重排目录或替换技术栈。
5. 不得擅自修改与当前任务无关的其他扩展；跨扩展改动必须先说明理由。
6. 用户明确的最新要求与本文冲突时，以用户要求为准，但必须指出冲突点、影响面与风险。
7. 不得编造业务需求、接口、权限或数据格式；影响架构、权限、安全、数据外发的关键决策，先问清楚再实现。
8. 不得伪造验证结果。没跑的命令就说没跑，跑失败了就贴失败原因。
9. 不自动执行 `git commit` / `push` / `reset` / `rebase` / `checkout --`，除非用户明确要求。
10. 不删除或覆盖用户已有的修改；发现工作区有未预期改动时先停下来说明。
11. 不确定依赖是否兼容 Manifest V3 时，先查官方文档，不要凭印象引入。

---

## 2. 扩展架构

### 2.1 三类执行环境（必须先分清）

| 环境 | 是什么 | 能用什么 | 不能用什么 |
| --- | --- | --- | --- |
| 网页上下文（MAIN world） | 页面自己的 JS 环境 | 页面 DOM、页面全局变量 | 任何 `chrome.*` API |
| Content Script（ISOLATED world） | 注入到页面的扩展脚本 | 页面 DOM、`chrome.runtime`/`chrome.storage`/`chrome.i18n` 等子集 | `chrome.tabs`/`chrome.scripting`/`chrome.cookies` 等特权 API；页面的 JS 变量 |
| 扩展自身上下文 | Service Worker、Popup、Options、Side Panel | 全部已授权 `chrome.*` API、`chrome.storage` | 当前标签页的 DOM（需 `scripting` 注入或消息转发） |

**环境之间不共享内存**。跨环境只能通过：消息通信、`chrome.storage`、DOM 读写、`postMessage`、动态注入。

### 2.2 各组件的职责与边界

| 组件 | 职责 | 边界与禁止事项 |
| --- | --- | --- |
| `manifest.json` | 权限声明、组件注册、资源暴露 | 不写注释；字段与构建产物严格对应；改权限必须同步更新扩展 README 的权限理由 |
| Background Service Worker | 事件驱动中枢：权限类 API 调用、跨标签页状态、消息路由、定时任务 | 不假设常驻；不保存必须长期存活的内存状态；不做长 CPU 任务（必要时用 `offscreen` 或拆成短任务） |
| Content Script | 与页面 DOM 交互：读取/增强页面、注入 UI、采集可见内容 | 不做需要特权 API 的事；注入 UI 必须隔离样式（Shadow DOM 或唯一前缀）避免污染页面；避免与页面全局变量冲突 |
| Popup | 轻量交互面板、当前页快捷开关 | 关闭即销毁，不能持有唯一状态；宽度有限，不做重型页面 |
| Options 页面 | 配置项管理、权限与隐私说明 | 配置项必须定义默认值与校验；读写统一走封装的 storage 模块 |
| Side Panel | 需要与页面并存的持续侧栏交互 | 只在确实需要"常驻面板"时使用；不要为绕开 Popup 生命周期而滥用 |
| 页面注入脚本（MAIN world） | 需要访问页面自身 JS 对象/函数的场景 | 必须显式声明 `world: 'MAIN'`；与 Content Script 之间用 `window.postMessage` 通信，并校验来源与消息格式 |
| Chrome Storage | 配置与状态持久化 | `storage.sync` 有配额限制，大数据用 `storage.local`；不存明文敏感凭据；不假设加密；key 统一加扩展前缀；结构变更要写迁移逻辑 |
| 消息通信 | 环境之间的唯一通道 | 必须定义消息类型枚举与 payload 类型；必须处理 `chrome.runtime.lastError`、接收端不存在、超时；必须校验来源（`sender.id` / `sender.tab`），不执行未校验的消息 |

### 2.3 最小架构原则

不要求每个扩展同时具备所有组件。默认从最小集合开始：

- 只改页面表现 → Content Script + `manifest.json`。
- 需要开关/配置 → 加 Popup 或 Options。
- 需要特权 API、跨页状态、后台任务 → 加 Background Service Worker。
- 需要常驻侧栏 → 才加 Side Panel。

新增一个组件前先回答：不用它会怎样？答不上来就不要加。

---

## 3. 目录规范

### 3.1 根目录职责

| 路径 | 职责 |
| --- | --- |
| `AGENTS.md` / `README.md` / `docs/` | 规范与文档 |
| `package.json` / `pnpm-workspace.yaml` | 工作区声明、聚合脚本、公共开发工具依赖 |
| `tsconfig.base.json` | 扩展 `tsconfig.json` 的继承基座 |
| `eslint.config.js` / `.prettierrc.json` / `.editorconfig` | 统一代码风格 |
| `scripts/` | 根级通用脚本（如 `list-extensions.mjs`），不含扩展业务逻辑 |
| `extensions/<name>/` | 每个扩展一个独立工程 |
| `packages/<name>/` | 仅存放被真实复用的公共代码（初期不存在，不要预建） |

禁止：在根目录放 Manifest、扩展源码、扩展业务依赖；在 `extensions/` 下放非扩展文件；把多个扩展的构建产物输出到同一目录。

### 3.2 扩展目录模板（按需取用，不要机械全建）

```
extensions/<name>/
├─ README.md            # 必需：功能、权限理由、开发/构建/加载/验证说明
├─ AGENTS.md            # 可选：该扩展的额外约定（与本文冲突时以本文为准）
├─ package.json         # 必需：name 与目录同名，自带 dev/build/typecheck/test 脚本
├─ manifest.json        # 必需：MV3 声明
├─ vite.config.ts       # 必需：构建入口与静态资源拷贝
├─ tsconfig.json        # 必需：extends "../../tsconfig.base.json"
├─ public/              # 可选：原样拷贝的图标等静态资源
├─ src/
│  ├─ background/       # Service Worker 入口与事件处理
│  ├─ content/          # Content Script 入口与页面适配
│  ├─ popup/            # 弹出页（html + ts + css）
│  ├─ options/          # 设置页
│  ├─ sidepanel/        # 侧边栏
│  ├─ shared/           # 本扩展内部共享：消息协议、storage 封装、类型、常量
│  ├─ lib/              # 与扩展 API 无关的纯函数工具
│  └─ styles/           # 共享样式
└─ tests/               # Vitest 单测
```

- 命名：目录与文件用小写英文 + 连字符（`web-data-collector`），代码内标识符用 camelCase / PascalCase。
- 单文件超过约 300 行或承担多个职责时必须拆分。
- 小型扩展（例如只有一个 Content Script）可以扁平为 `src/content.ts` + `src/shared/`，不要为了对齐模板制造空目录。

---

## 4. 编码规范

1. TypeScript 优先，启用 strict；**禁止随意 `any`**（ESLint 已设为 error）。确实无法确定类型时用 `unknown` + 类型守卫。
2. 公共函数、消息 payload、storage 数据结构必须有显式类型定义，类型放 `src/shared/`。
3. 函数单一职责，控制长度与嵌套层级；早返回代替深层 `if`。
4. 常量集中管理（`src/shared/constants.ts`），禁止散落魔法值；消息类型、storage key 一律用常量或 `as const` 对象。
5. 异步必须处理失败：`try/catch`、`Promise.catch` 或显式错误分支；不得吞掉异常。
6. 权限申请、消息通信、数据持久化、DOM 注入处必须写注释说明**为什么**这么做（不写"这里在赋值"这类废话）。
7. 不写无意义注释，不复制粘贴大段重复代码；重复三次以上再抽象。
8. 统一遵循 `eslint.config.js` 与 `.prettierrc.json`；不提交带 lint error 的代码。
9. 命名语义清晰，禁止自造缩写；布尔值用 `is/has/should` 前缀。
10. 不为简单功能引入设计模式、状态管理库或额外抽象层；能用 20 行解决就不写 200 行。
11. 注释与文档使用中文；代码标识符使用英文。
12. 用户可见文案集中管理（便于后续 i18n），不在逻辑代码中硬编码大段字符串。

---

## 5. Chrome 扩展安全规范

1. **最小权限**：只申请当前功能必需的权限，能用 `activeTab` 就不用 `tabs`，能用 `optional_host_permissions` 就不用静态 Host Permissions。
2. **禁止**为了省事申请 `<all_urls>`、`*://*/*` 或与功能无关的 host 匹配；确需广泛匹配时必须在扩展 README 说明理由与替代方案。
3. 新增权限前必须：说明必要性 → 评估更小范围 → 记录到扩展 README 的"权限说明"表。
4. 禁止在代码、Manifest、构建配置中硬编码 Token、密码、私钥、Cookie、个人账号信息。需要密钥时由用户本地配置，且不得提交。
5. 不得假设 `chrome.storage` 加密或具备机密性；敏感数据要么不存，要么向用户说明风险。
6. 未经用户明确授权，不得将 Cookie、页面内容、浏览记录、用户数据上传到任何第三方服务；涉及外发必须：显式开关（默认关闭）+ 告知去向 + 提供清除入口。
7. 禁止 `eval`、`new Function`、`setTimeout(string)`、远程脚本/CDN 加载、远程 `import()`。MV3 CSP 会拦截，但代码评审同样必须拦住。
8. 页面交互防 XSS：优先 `textContent` / `setAttribute`；禁止把页面或外部字符串直接拼进 `innerHTML`；必须用 `innerHTML` 时要有转义或白名单清洗。
9. 注入页面的 UI 必须做样式隔离（Shadow DOM 或唯一类名前缀 + 兜底样式重置），避免破坏目标站点。
10. `web_accessible_resources` 只暴露必要文件，匹配范围尽量收紧，优先 `use_dynamic_url: true`。
11. 消息处理必须校验 `sender` 与消息结构，拒绝未知 type；不得把消息内容当作可信配置直接执行。
12. 采集类扩展必须遵守目标站点条款、robots 约定、用户授权与适用法律，并提供明显的停用方式。
13. 不在扩展中引入带已知漏洞的依赖；新增依赖前确认维护活跃度与体积。

---

## 6. Manifest V3 运行机制

1. Service Worker **随时可能被终止**（无事件约 30 秒），不得依赖模块顶层变量保存状态。
2. 需要跨事件存活的状态：用户配置 → `chrome.storage.sync/local`；会话级临时态 → `chrome.storage.session`；内存仅用于单次事件内的缓存。
3. 事件监听器必须在 Service Worker **顶层同步注册**，不能在异步回调里注册（否则唤醒后监听不到）。
4. 消息通信必须处理三种失败：接收端不存在（`Could not establish connection`）、`lastError`、超时。长任务用 `sendResponse` + `return true`，或改为端口长连接。
5. Content Script 需要页面自身上下文时，明确区分 `world: 'ISOLATED'`（默认，安全）与 `world: 'MAIN'`（必要才用），并在注释中写明理由。
6. `chrome.scripting.executeScript` 注入的函数必须自包含，不能引用外部闭包变量。
7. 构建产物必须满足 MV3 加载要求：无内联事件处理器、无 `unsafe-eval`；使用 ESM 时 Service Worker 声明 `"type": "module"`。
8. 禁止把 Vite dev server 地址、`localhost`、源码路径写进正式 Manifest 或产物。
9. 交付前必须核对：Manifest 中引用的每个 `js`/`css`/`html`/`icons`/`web_accessible_resources` 路径在 `dist/` 中真实存在。
10. `host_permissions` 与 `content_scripts.matches` 必须一致地覆盖功能所需站点，不多不少。

---

## 7. Git 规范

1. 不提交：`node_modules/`、`dist/`、构建产物、测试报告、缓存、临时文件、本地环境配置。
2. 不提交：密钥、Token、Cookie、个人账号数据、测试账号凭据、浏览器用户目录。
3. `.env.example` 只放占位符与说明，禁止真实值。
4. 提交 `pnpm-lock.yaml`，保证构建可复现。
5. 每个扩展独立维护自己的 `version`（`package.json` 与 `manifest.json` 保持一致）与变更记录。
6. 除非用户明确要求，不自动执行 `git commit`、`push`、`reset`、`rebase`、`checkout --`、`stash drop`。
7. 不得删除或覆盖用户已有改动；不得用 `git add -A` 把无关改动混进提交。
8. 提交信息说明改了什么、为什么。

---

## 8. 测试与交付

每次修改至少完成**适用**的验证：

| 检查项 | 命令 |
| --- | --- |
| 类型检查 | `pnpm --filter <name> typecheck` 或 `pnpm run typecheck` |
| ESLint | `pnpm run lint` |
| 格式 | `pnpm run format:check` |
| 单测 | `pnpm --filter <name> test` |
| 构建 | `pnpm --filter <name> build` |
| Manifest / 资源路径核对 | 人工核对 `dist/manifest.json` 引用的文件是否存在 |
| 全量聚合 | `pnpm run check` |

要求：

- 纯逻辑（数据转换、消息编解码、storage 迁移、URL 解析）必须有 Vitest 单测。
- 浏览器行为（DOM 注入、页面交互、权限弹窗、Service Worker 生命周期）无法自动化时，必须在交付说明中列出**可复现的人工验证步骤**。
- 不得因为"构建成功"就宣称功能已验证；构建通过 ≠ 功能可用。
- 新增扩展或修改权限后，必须实际加载到 Chrome 验证一次。

交付说明必须包含：

1. 修改了哪些文件（路径 + 变化）。
2. 实现了什么、为什么这么做。
3. 执行了哪些验证命令及其结果。
4. 哪些验证**未**执行及原因。
5. 如何启动、构建、在 Chrome 中加载。
6. 已知问题与风险。

---

## 9. 新增扩展的标准流程

按顺序执行，不得跳步：

1. 阅读根目录 `AGENTS.md`、`README.md`、`docs/architecture.md`。
2. 与用户确认：扩展目标、使用场景、目标网站、功能边界。
3. 判定组件需求（Content Script / Popup / Options / Background / Side Panel / 注入脚本），并说明每个组件的必要性。
4. 设计最小可行目录结构与**权限清单**（逐条写用途）。
5. 创建 `extensions/<name>/`：`package.json`（`name` 与目录同名，含 `dev`/`build`/`typecheck`/`test` 脚本）、`tsconfig.json`（extends 根配置）、`vite.config.ts`、`manifest.json`、`README.md`（含权限说明表）。
6. 实现业务功能，代码按第 3 节目录规范组织；可测逻辑配 Vitest 单测。
7. 依次执行：`pnpm install`（如需新依赖）→ `pnpm --filter <name> typecheck` → `pnpm run lint` → `pnpm --filter <name> test` → `pnpm --filter <name> build`。
8. 核对 `dist/manifest.json` 与产物文件路径一致。
9. 说明如何在 `chrome://extensions/` 加载 `extensions/<name>/dist`，并给出人工验证步骤。
10. 更新根目录 `README.md` 第 10 节的扩展清单（可用 `pnpm run list:ext` 校对）。

禁止：跳过规范阅读、跳过权限评估、直接复制其他扩展代码作为新扩展起点（易带入无关权限与逻辑）。

---

## 10. 命令速查

```bash
pnpm install                    # 安装工作区依赖
pnpm run list:ext               # 列出当前所有扩展
pnpm run lint                   # 全仓 ESLint
pnpm run format                 # Prettier 格式化
pnpm run typecheck              # 所有扩展类型检查
pnpm run test                   # 所有扩展单测
pnpm run build                  # 构建所有扩展
pnpm run check                  # lint → format:check → typecheck → test → build

pnpm --filter <name> dev        # 单扩展开发（watch）
pnpm --filter <name> build      # 单扩展构建
pnpm --filter <name> typecheck  # 单扩展类型检查
pnpm --filter <name> test       # 单扩展单测
pnpm --filter <name> add -D <pkg>
```

新增或修改根脚本时，必须同步更新 `README.md` 第 8 节，保证文档与 `package.json` 一致。
