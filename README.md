# dsh-search-screen

给 **DeepSeek Harness（dsh）Web UI** 加一个「搜索大屏」：左侧栏一个放大镜入口，点开是整窗的搜索页——大搜索框、DeepSeek 摘要、可引用的来源列表。搜索走 dsh 自己的 web 搜索服务（`ctx.web`），和模型侧的 `web_search` 工具使用同一套 provider 选择，所以**在 profile 里配置一次，两边同时生效**。

这是一个独立插件包（bundle + Client UI 插件），不依赖 dsh 源码仓库，也没有任何 npm 运行时依赖。

## 界面

- **侧栏入口**：与「插件」「自动化任务」同级，点击打开全局面板（不绑定 Session）。
- **搜索首页**：品牌 tile + 「DeepSeek 搜索」字样，居中大号胶囊搜索框（含清除按钮），下方 `Enter` / `Esc` 键位提示与「试试这些 / 最近搜索」chips；背景有一层极淡的品牌色径向光晕。
- **结果页**：搜索框收进**粘性工具栏**（滚动时始终可改词），下面是 `「查询」· N 条结果 · 0.6 秒` 元信息、DeepSeek 摘要卡片和来源列表；来源带站点首字母图标、标题、站点 / 日期、两行摘要，悬停显示「新标签页打开」箭头。
- **状态**：搜索中骨架屏、空结果、失败卡片（错误码 chip + 重试 + 返回首页）、超时提示；全部文案走 dsh 的 locale 服务（中文 / English）。
- **交互**：搜索后焦点留在输入框可直接改词；`Esc` 先清空、再回首页；输入法组合状态下的 Enter 不会误提交；从侧栏重新进入面板会自动聚焦；最近搜索在本次页面内跨面板保留。
- **主题**：只用 `--dsw-alias-*` 主题 token，自动跟随明暗主题；窄屏（≤720px）单列布局、图标式返回；`prefers-reduced-motion` 下关闭动效。

## 安装

在 dsh 的 Web UI 里：**插件 → 添加插件 → 选择本地目录**，选中本仓库目录；或让 Agent 用 `plugin_manager` 的 `install_bundle` 安装本目录。安装后侧栏出现「搜索」入口，无需重启（Host 半与 Client 半都会随组合激活）。

也可以手动加进 profile，把一个 `link:` 依赖装进 profile 再在 `cordis.patch.yml` 里插入同名行；推荐还是用插件管理器，它会写 dependencies、选 bundle、触发重载。

## 配置

行 id 为 `search-screen`，两个可选字段（越界时插件加载会直接报错，不会静默取默认值）：

| 字段 | 默认 | 范围 | 含义 |
|---|---|---|---|
| `maxResults` | `8` | 1–20 | 每次搜索返回的来源条数上限（同时作为 `maxResults` 传给 `ctx.web.search`） |
| `timeoutMs` | `20000` | 1000–120000 | 单次搜索的超时时间 |

在 profile 的 `cordis.patch.yml` 里按行 id 覆盖即可（补丁层会整体替换该行 `config`）：

```yaml
- id: search-screen
  name: dsh-search-screen
  config:
    maxResults: 12
    timeoutMs: 30000
```

搜索 provider 由 profile 的 `web` 行决定（例如本机 web profile 固定为 `deepseek-search-api`）。凭证同样复用 dsh 的 credentials / 启动环境：没有 `DEEPSEEK_API_KEY` 时页面会显示 provider 返回的 `WEB_PROVIDER_CREDENTIAL_MISSING` 说明，而不是空白。

## 实现

```
package.json      bundle + Client 声明（dsh.bundle.patch / dsh.client.platform: web）
cordis.patch.yml  insert 一行 search-screen
index.js          Host 半：注册 GET /search-screen/search，把查询交给 ctx.web.search
handler.js        路由逻辑（入参校验、超时、错误映射、JSON 投影），独立以便单测
client.js         Client 半：注册 sidebar.panellist 图标 + main 面板页面
locale/*.json     插件管理器展示用标题与描述
icon.svg          插件图标
```

- **Client 半**通过 `window.__ModuleLoader__.load({ id: 'dsh-search-screen', factory(require) })` 注册，`id` 必须等于包名；用 `ctx.slots.inject()` + `ctx.slots.register()` 把图标注册进 `sidebar.panellist`（`id: 'search-screen'`），把页面注册进 `main` 键控槽位（同 id），点击侧栏即由 layout 选中该面板。
- **Client → Host** 走同包私有 HTTP 路由：页面 `fetch('search-screen/search?q=…')`（相对路径，和 dsh 的 `open-in-app` 一致），Host 半用 `ctx.web.search({ query, maxResults }, signal)` 执行并返回 JSON。这样不需要 typert/Remote 生成产物，插件可以在任何 dsh 版本里按纯 JS 加载。
- **信任围栏**：路由存在 `connection` 服务时先调用它的 `requestRejection(req)`（Host/Origin 校验 + 浏览器登录态），再处理请求；只有 GET，查询上限 500 字符。
- 失败映射：带 `code` 的 `WebError` 以 `200 { ok:false, error:{ code, message } }` 返回给页面（页面按 code 显示本地化文案，其余展示 Host 的说明）；未知内部错误返回 500 并写日志。

## 开发与测试

```sh
pnpm install      # 仅测试用的 React / jsdom devDependency，插件运行时零依赖
node --check index.js
node --check client.js
npm test          # node --test（23 个用例）
```

- `tests/handler.test.mjs` 用假 `req`/`res` 覆盖：查询裁剪与上限、seam 调用参数、来源投影与耗时、信任围栏、错误码映射、超时、405。
- `tests/client.test.mjs` 用假 `window.__ModuleLoader__` 捕获插件工厂，校验 `apply` 注册的槽位/字典，并用 `react-dom/server` 冒烟渲染页面（发现会炸掉槽位条目的组件错误），同时校验样式只引用宿主 token、没有字面色值。
- `tests/client.interaction.test.mjs` 在 jsdom 里真实输入、提交、等待结果：覆盖结果渲染、骨架屏、失败重试、空结果、`Esc`/清除、IME 组合态 Enter 不提交、焦点保持、最近搜索跨面板保留。
- Client 半改动会被 dsh 的 client-hmr 通过 `lib/client.js`（本包即 `client.js`）的 mtime 轮询热替换；Host 半改动在下次 profile 重组（插件管理器操作或 patch 变更）时生效。
- 页面样式只用 `--dsw-alias-*` / `--dsw-radius-*` 等宿主 token；没有 import 任何 `@deepseek-ai/dsh-client-*` 包，dsh 升级不会让这个入口崩掉。

## 已知限制

- **只服务 Web**（含 `dsh web` 的浏览器端）。Desktop/IPC 载体下页面里的相对 `fetch` 不保证可用。
- 路由依赖 dsh 的 `webServer` 与 `web` 两个服务；没有 `webServer` 的组合（headless/SDK）不会激活本插件，也没有可打开的页面。
- 搜索在 Session 之外执行，因此只走 provider 的 API key 凭证，不会借用 DeepSeek Account 的会话令牌；用 Account 模型登录但没有存 API key 的环境会看到凭证缺失提示。
- 不做流式结果、不做站内打开；最近搜索只存在插件实例内存里，刷新页面或重启后清空。
