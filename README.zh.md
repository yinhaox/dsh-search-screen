# dsh-search-screen

[![npm](https://img.shields.io/npm/v/@yinhaox/dsh-search-screen.svg)](https://www.npmjs.com/package/@yinhaox/dsh-search-screen)
[![CI](https://github.com/yinhaox/dsh-search-screen/actions/workflows/ci.yml/badge.svg)](https://github.com/yinhaox/dsh-search-screen/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 中文

DeepSeek Harness（dsh）Web UI 的网页搜索插件。侧栏的「搜索」入口打开一个全屏搜索页，搜索走 dsh 已配置的搜索服务，页面展示答案和来源。

![搜索首页](https://raw.githubusercontent.com/yinhaox/dsh-search-screen/main/docs/screenshots/search-home.png)

![搜索结果页](https://raw.githubusercontent.com/yinhaox/dsh-search-screen/main/docs/screenshots/search-results.png)

## 功能

- 侧栏全局入口，打开全屏搜索页（不绑定 Session）
- 浏览器式外壳：顶部页签条，每个页签各自保留搜索、结果、阅读视图和滚动位置；`+` 或双击页签条空白处新建，`×` 或中键关闭，只有一个页签时不可关闭
- 结果显示答案、来源标题、站点、发布日期和摘要
- 点击结果标题在页内阅读正文：宿主抓取网页后只保留标题、段落、列表、引用和代码块，按界面主题排版；阅读页可返回结果，标题右侧的 ↗ 仍在新标签页打开原文
- 搜索框兼作地址栏：粘贴 `http(s)` 网址按 Enter 直接打开阅读视图，不发起搜索
- 搜索中、无结果、失败、超时各有对应状态，抓取网页同样区分超时、过大、不支持的类型和访问失败
- 中文 / English 界面，跟随 dsh 的语言设置和明暗主题
- 纯 JavaScript，零运行时依赖，无需构建

## 安装

在 Web UI 里打开 **插件 → 添加插件**，输入 npm 包名 `@yinhaox/dsh-search-screen`；也可以用 Git 地址或本地目录安装。安装后侧栏出现「搜索」入口，无需重启。

## 使用

点击侧栏「搜索」，输入关键词按 Enter。搜索后焦点留在输入框，可以直接改词再搜；Esc 清空输入，输入为空时再按 Esc 回到首页。

页面顶部是页签条，每个页签是一个独立的页面：搜索、结果和阅读视图都留在自己的页签里，切走再切回不会丢内容，也不会打断另一个页签正在进行的抓取。页签标题取当前网页标题或搜索词，加载中有状态点。点 `+` 或双击页签条空白处新建页签，点 `×`（只有一个页签时不可用）或中键关闭。

点结果标题会在页内打开阅读视图；「返回结果」按钮或 Esc 回到结果列表，「查看原文」在新标签页打开原网页。结果标题右侧的 ↗ 也可以直接在新标签页打开。

把 `http://` 或 `https://` 开头的网址粘贴到搜索框按 Enter，会跳过搜索直接在页内打开该网页的阅读视图，按钮同时显示为「阅读」；此时返回按钮回到搜索首页，若地址是从结果页输入的则回到结果列表。不带协议的文本（例如 `example.com`）仍按搜索词处理，避免把普通查询变成跳转。

## 配置

插件的行 id 是 `search-screen`，三个可选字段：

| 字段 | 默认 | 范围 | 说明 |
|---|---|---|---|
| `maxResults` | `8` | 1–20 | 返回的来源条数 |
| `timeoutMs` | `20000` | 1000–120000 | 单次搜索的超时时间 |
| `pageTimeoutMs` | `30000` | 1000–120000 | 抓取单个网页的超时时间 |

在 profile 的 `cordis.patch.yml` 里按行 id 覆盖：

```yaml
- id: search-screen
  name: '@yinhaox/dsh-search-screen'
  config:
    maxResults: 12
    timeoutMs: 30000
    pageTimeoutMs: 45000
```

搜索服务由 profile 的 `web` 行决定，与智能体的 `web_search` 工具共用；凭证沿用 dsh 的 credentials / 启动环境。

## 开发

需要 Node 22.19 或更新的版本。

```sh
npm install
npm test
```

测试覆盖 Host 路由、插件注册、正文抽取，以及 jsdom 下的页面交互。

## 已知限制

- 仅支持 `dsh web`；Desktop 的 IPC 载体下不保证可用。
- 依赖 `webServer` 和 `web` 服务，headless / SDK 组合下不会激活。
- 搜索在 Session 之外执行，只使用 API key 凭证。
- 网址最多 2048 个字符，搜索词最多 500 个字符。
- 最近搜索只保存在内存中，刷新或重启后清空。
- 页签与其内容同样只保存在内存中：离开「搜索」面板再回来，会回到一个空白页签。
- 页签没有 `Ctrl+T` / `Ctrl+W` / `Ctrl+Tab` 快捷键：这些是浏览器保留的按键，网页无法接管，按下只会作用在外层浏览器上。
- 阅读视图只保留标题、正文段落、列表、引用和代码块，不加载图片、脚本和原站样式；需要登录或被反爬策略拒绝的站点会显示抓取失败。
- 抓取只接受 HTTP(S)，并拒绝本机、私有网段和保留域名的字面地址（包括重定向目标）；不解析 DNS 判断解析结果。
- 单个页面最多读取 2 MB、5 次重定向。

## 发布

发布由 GitHub Actions 完成（[`.github/workflows/publish.yml`](.github/workflows/publish.yml)）。在 npm 包设置里配置 Trusted publishing 后，更新 `package.json` 的版本并推送 `v*` tag 即可。

## License

[MIT](LICENSE) © yinhaox
