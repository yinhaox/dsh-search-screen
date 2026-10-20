# dsh-search-screen

[![npm](https://img.shields.io/npm/v/@yinhaox/dsh-search-screen.svg)](https://www.npmjs.com/package/@yinhaox/dsh-search-screen)
[![CI](https://github.com/yinhaox/dsh-search-screen/actions/workflows/ci.yml/badge.svg)](https://github.com/yinhaox/dsh-search-screen/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [中文](README.zh.md)

A web search plugin for the DeepSeek Harness (dsh) Web UI. The Search entry in the sidebar opens a full-window search page that uses the search service already configured in dsh and shows answers and sources.

## Features

- Global sidebar entry that opens a full-window search page, independent of the current Session
- Results show the answer, source titles, sites, publication dates, and snippets; links open in a new tab
- Dedicated states for searching, no results, failures, and timeouts
- English and Chinese UI, following the language and theme set in dsh
- Plain JavaScript with no runtime dependencies and no build step

## Install

In the Web UI, open **Plugins → Add plugin** and enter the npm package name `@yinhaox/dsh-search-screen`; a Git URL or local directory works too. The Search entry appears in the sidebar after installation, with no restart.

## Usage

Open **Search** in the sidebar, type a query, and press Enter. Focus stays in the field after a search, so the query can be edited and run again; Esc clears the field, and pressing Esc on an empty field returns to the search home.

## Configuration

The row id is `search-screen`, with two optional fields:

| Field | Default | Range | Description |
|---|---|---|---|
| `maxResults` | `8` | 1–20 | Number of sources returned |
| `timeoutMs` | `20000` | 1000–120000 | Timeout for one search |

Override them by row id in the profile's `cordis.patch.yml`:

```yaml
- id: search-screen
  name: '@yinhaox/dsh-search-screen'
  config:
    maxResults: 12
    timeoutMs: 30000
```

The search service comes from the profile's `web` row and is shared with the agent's `web_search` tool; credentials come from dsh's credentials / launch environment.

## Development

Node 22.19 or newer is required.

```sh
npm install
npm test
```

Tests cover the Host route, plugin registration, and page interaction under jsdom.

## Limitations

- Web only (`dsh web`); the Desktop IPC carrier is not guaranteed to work.
- Requires the `webServer` and `web` services; compositions such as headless or the SDK do not activate the plugin.
- Searches run outside a Session, so they use API key credentials only.
- Recent searches live in memory and are cleared on refresh or restart.

## Release

Releases run in GitHub Actions ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)). After configuring npm Trusted publishing, bump the version in `package.json` and push a `v*` tag.

## License

[MIT](LICENSE) © yinhaox
