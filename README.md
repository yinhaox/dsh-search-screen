# dsh-search-screen

[![npm](https://img.shields.io/npm/v/@yinhaox/dsh-search-screen.svg)](https://www.npmjs.com/package/@yinhaox/dsh-search-screen)
[![CI](https://github.com/yinhaox/dsh-search-screen/actions/workflows/ci.yml/badge.svg)](https://github.com/yinhaox/dsh-search-screen/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [中文](README.zh.md)

A web search plugin for the DeepSeek Harness (dsh) Web UI. The Search entry in the sidebar opens a full-window search page that uses the search service already configured in dsh and shows answers and sources.

![Search page](https://raw.githubusercontent.com/yinhaox/dsh-search-screen/main/docs/screenshots/search-home.png)

![Search results](https://raw.githubusercontent.com/yinhaox/dsh-search-screen/main/docs/screenshots/search-results.png)

## Features

- Global sidebar entry that opens a full-window search page, independent of the current Session
- A browser-style frame with a tab strip: each tab keeps its own search, results, reader, and scroll position; `+` or a double-click on empty strip space opens a tab, `×` or middle click closes one, and the last tab cannot be closed
- Results show the answer, source titles, sites, publication dates, and snippets
- Clicking a result title opens that page in the in-app reader: the Host fetches the page and the plugin keeps the title, paragraphs, lists, quotes, and code blocks, laid out with the host theme; the reader returns to the results, and the ↗ beside each title still opens the original in a new tab
- Dedicated states for searching, no results, failures, and timeouts, with reader failures distinguishing timeouts, oversized pages, unsupported types, and unreachable sites
- The field doubles as an address bar: paste an `http(s)` URL and press Enter to open the reader for that page without running a search
- English and Chinese UI, following the language and theme set in dsh
- Plain JavaScript with no runtime dependencies and no build step

## Install

In the Web UI, open **Plugins → Add plugin** and enter the npm package name `@yinhaox/dsh-search-screen`; a Git URL or local directory works too. The Search entry appears in the sidebar after installation, with no restart.

## Usage

Open **Search** in the sidebar, type a query, and press Enter. Focus stays in the field after a search, so the query can be edited and run again; Esc clears the field, and pressing Esc on an empty field returns to the search home.

The tab strip at the top holds one independent page per tab: a search, its results, and any reader view stay in their own tab, so switching away and back loses nothing and never cancels a read in another tab. A tab is labelled with the page title or the query and shows a dot while it loads. `+` or a double-click on empty strip space opens a tab; `×` (disabled on the last tab) or a middle click closes one.

Clicking a result title opens the reader view of that page. **Back to results** or Esc returns to the list, and **Open the original** opens the page in a new tab; the ↗ beside each result title also opens it directly.

Paste an `http://` or `https://` address into the field and press Enter to open that page's reader view directly, without a search; the button reads **Read** while the text is an address. **Back** then returns to the search home, or to the results list when the address was typed there. Text without a scheme (for example `example.com`) still runs as a query, so an ordinary search never turns into a navigation.

## Configuration

The row id is `search-screen`, with three optional fields:

| Field | Default | Range | Description |
|---|---|---|---|
| `maxResults` | `8` | 1–20 | Number of sources returned |
| `timeoutMs` | `20000` | 1000–120000 | Timeout for one search |
| `pageTimeoutMs` | `30000` | 1000–120000 | Timeout for reading one page |

Override them by row id in the profile's `cordis.patch.yml`:

```yaml
- id: search-screen
  name: '@yinhaox/dsh-search-screen'
  config:
    maxResults: 12
    timeoutMs: 30000
    pageTimeoutMs: 45000
```

The search service comes from the profile's `web` row and is shared with the agent's `web_search` tool; credentials come from dsh's credentials / launch environment.

## Development

Node 22.19 or newer is required.

```sh
npm install
npm test
```

Tests cover the Host routes, plugin registration, source extraction, and page interaction under jsdom.

## Limitations

- Web only (`dsh web`); the Desktop IPC carrier is not guaranteed to work.
- Requires the `webServer` and `web` services; compositions such as headless or the SDK do not activate the plugin.
- Searches run outside a Session, so they use API key credentials only.
- Recent searches live in memory and are cleared on refresh or restart.
- Tabs and their contents live in memory too: leaving the Search panel and coming back starts from one blank tab.
- Tabs have no `Ctrl+T` / `Ctrl+W` / `Ctrl+Tab` shortcuts: browsers reserve those, so a page cannot intercept them and they would act on the outer browser.
- The reader keeps only the title, body paragraphs, lists, quotes, and code blocks; images, scripts, and the site's own styling are dropped. Pages that need a login, or that refuse automated requests, show a fetch failure.
- The reader fetches HTTP(S) only and refuses literal loopback, private-range, and reserved-name hosts, including redirect targets; DNS answers are not inspected.
- One page is bounded to 2 MB and five redirects.
- A page address may be up to 2048 characters; a search query may be up to 500.

## Release

Releases run in GitHub Actions ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)). After configuring npm Trusted publishing, bump the version in `package.json` and push a `v*` tag.

## License

[MIT](LICENSE) © yinhaox
