/**
 * dsh-search-screen browser half: the sidebar entry that opens a full-window
 * search page, the page itself, and its in-page reader.
 *
 * The page calls this package's Host routes: `/search-screen/search` runs the
 * query through the composition's web seam (`ctx.web`) — the same provider
 * selection the model-facing `web_search` tool uses — and `/search-screen/page`
 * fetches one result page for the reader. Styling consumes host theme tokens
 * only, and no Harness Client package is imported, so a Harness upgrade cannot
 * blank this entry.
 */

window.__ModuleLoader__.load({
  id: '@yinhaox/dsh-search-screen',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    /** Locale namespace owned by this plugin. */
    const NS = 'searchScreen'
    /** Sidebar entry id and the matching `main` panel key. */
    const PANEL_ID = 'search-screen'
    /** Page-relative Host route registered by `index.js`. */
    const SEARCH_ROUTE = 'search-screen/search'
    /** Page-relative Host route that reads one HTTP(S) page for the reader. */
    const PAGE_ROUTE = 'search-screen/page'
    /** Longest query the page submits; the Host route enforces the same bound. */
    const MAX_QUERY_LENGTH = 500
    /** Queries kept in the page's recents list. */
    const RECENT_LIMIT = 6

    const zh = {
      'panel': '搜索',
      'title': 'DeepSeek 搜索',
      'subtitle': '用 DeepSeek 搜索服务查找全网信息',
      'placeholder': '输入搜索内容，按 Enter 搜索',
      'search': '搜索',
      'searching': '搜索中…',
      'formAria': '搜索',
      'hint.enter': '搜索',
      'hint.esc': '清空',
      'heroExamples': '试试这些',
      'heroRecent': '最近搜索',
      'backHome': '回到搜索首页',
      'clear': '清空输入',
      'open': '在新标签页打开',
      'read': '阅读网页',
      'reader.back': '返回结果',
      'reader.loading': '正在读取网页…',
      'reader.failed': '无法读取该网页',
      'reader.words': '约 {count} 字',
      'reader.truncated': '内容过长，已截断',
      'reader.original': '查看原文',
      'reader.note': '正文由 DSH 宿主抓取，样式已简化',
      'reader.empty': '该网页没有可阅读的正文。',
      'results.query': '“{query}”',
      'results.count': '{count} 条结果',
      'results.time': '{seconds} 秒',
      'results.truncated': '已按上限截断',
      'answer.label': 'DeepSeek 摘要',
      'empty.title': '没有找到相关结果',
      'empty.hint': '试试更简短或不同的关键词',
      'error.title': '搜索失败',
      'error.retry': '重试',
      'error.home': '返回首页',
      'error.unknown': '发生未知错误，请稍后重试。',
      'error.offline': '无法连接到 DSH 宿主，请确认服务仍在运行。',
      'error.invalidQuery': '请输入搜索内容。',
      'error.tooLong': '搜索内容不能超过 {max} 个字符。',
      'error.timeout': '搜索超时，请稍后重试，或缩小搜索范围。',
      'error.invalidUrl': '网页地址无效。',
      'error.protocol': '只支持 http / https 网页。',
      'error.privateHost': '出于安全考虑，不抓取本机或内网地址。',
      'error.fetchFailed': '网页无法访问，或服务器拒绝了请求。',
      'error.pageTimeout': '读取网页超时，请稍后重试。',
      'error.tooLarge': '网页内容过大，无法完整读取。',
      'error.unsupportedType': '该链接不是可阅读的网页正文。',
      'error.pageFailed': '读取网页时发生未知错误，请稍后重试。',
      'error.badResponse': '网页返回了无法解析的数据。',
      'foot': '结果由 DeepSeek 搜索服务提供，最多 {max} 条',
    }
    const en = {
      'panel': 'Search',
      'title': 'DeepSeek Search',
      'subtitle': 'Search the web through the DeepSeek search service',
      'placeholder': 'Search the web, press Enter',
      'search': 'Search',
      'searching': 'Searching…',
      'formAria': 'Search',
      'hint.enter': 'to search',
      'hint.esc': 'to clear',
      'heroExamples': 'Try one of these',
      'heroRecent': 'Recent searches',
      'backHome': 'Back to the search home',
      'clear': 'Clear the query',
      'open': 'Open in a new tab',
      'read': 'Read this page',
      'reader.back': 'Back to results',
      'reader.loading': 'Reading the page…',
      'reader.failed': 'Could not read this page',
      'reader.words': '{count} characters',
      'reader.truncated': 'Truncated because the page is long',
      'reader.original': 'Open the original',
      'reader.note': 'Fetched by the DSH host; styling simplified',
      'reader.empty': 'This page has no readable text.',
      'results.query': '“{query}”',
      'results.count': '{count} results',
      'results.time': '{seconds}s',
      'results.truncated': 'cut to the configured limit',
      'answer.label': 'DeepSeek summary',
      'empty.title': 'No results for this query',
      'empty.hint': 'Try a shorter or different query',
      'error.title': 'Search failed',
      'error.retry': 'Retry',
      'error.home': 'Back to home',
      'error.unknown': 'Something unexpected happened. Try again.',
      'error.offline': 'Cannot reach the DSH host. Check that the service is still running.',
      'error.invalidQuery': 'Enter a search query.',
      'error.tooLong': 'The query cannot exceed {max} characters.',
      'error.timeout': 'The search timed out. Try again with a narrower query.',
      'error.invalidUrl': 'That page address is not valid.',
      'error.protocol': 'Only http and https pages can be read.',
      'error.privateHost': 'Local and private network addresses are not fetched.',
      'error.fetchFailed': 'The page could not be reached, or the server refused the request.',
      'error.pageTimeout': 'Reading the page timed out. Try again.',
      'error.tooLarge': 'The page is too large to read.',
      'error.unsupportedType': 'That link is not a readable page.',
      'error.pageFailed': 'Something went wrong while reading the page.',
      'error.badResponse': 'The page returned data the reader could not use.',
      'foot': 'Results come from the DeepSeek search service, at most {max}',
    }
    /** Example queries offered on the empty search page. */
    const EXAMPLES = {
      zh: ['DeepSeek Harness', 'Cordis 插件系统', 'DeepSeek 最新模型', 'Rust 异步编程'],
      en: ['DeepSeek Harness', 'Cordis plugin system', 'DeepSeek latest model', 'Rust async'],
    }

    const CSS = `
.dsh-search-screen__page { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; height: 100%; overflow-y: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: var(--dsh-content-font-size, 14px); }
.dsh-search-screen__page[data-mode='hero'] { background: radial-gradient(1000px 460px at 50% 0%, color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-base)), var(--dsw-alias-bg-base) 68%); }
.dsh-search-screen__header { box-sizing: border-box; width: 100%; }
.dsh-search-screen__page[data-mode='hero'] .dsh-search-screen__header { padding: calc(var(--dsh-frame-top-clearance, 0px) + clamp(64px, 18vh, 184px)) 24px 56px; }
.dsh-search-screen__headerInner { display: flex; flex-direction: column; align-items: center; gap: 26px; width: 100%; max-width: 820px; margin: 0 auto; }
.dsh-search-screen__brand { display: flex; align-items: center; gap: 16px; }
.dsh-search-screen__brandText { display: flex; flex-direction: column; min-width: 0; }
.dsh-search-screen__brandTile { display: inline-flex; flex: none; width: 48px; height: 48px; }
.dsh-search-screen__brandTile svg { display: block; width: 100%; height: 100%; }
.dsh-search-screen__title { margin: 0; font-size: 34px; line-height: 42px; font-weight: 600; letter-spacing: -0.8px; }
.dsh-search-screen__subtitle { margin: 2px 0 0; font-size: 13.5px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__form { position: relative; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; height: 60px; padding: 0 8px 0 20px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 1px 2px var(--dsw-alias-bg-mask-2); transition: border-color var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease), box-shadow var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__form:focus-within { border-color: var(--dsw-alias-state-business-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-state-business-primary) 15%, transparent), 0 1px 2px var(--dsw-alias-bg-mask-2); }
.dsh-search-screen__searchIcon { display: inline-flex; flex: none; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__input { flex: 1; min-width: 0; height: 100%; padding: 0; border: none; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 16px; }
.dsh-search-screen__input::placeholder { color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__clear { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: none; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease), color var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__clear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-search-screen__submit { flex: none; height: 44px; padding: 0 22px; border: none; border-radius: 999px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__submit:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-search-screen__submit:disabled { cursor: default; background: var(--dsw-alias-button-primary-dimmed); color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__hint { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: -8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__hintItem { display: inline-flex; align-items: center; gap: 6px; }
.dsh-search-screen__kbd { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dsh-search-screen__suggestions { display: flex; flex-direction: column; align-items: center; gap: 18px; width: 100%; }
.dsh-search-screen__chipGroup { display: flex; flex-direction: column; align-items: center; gap: 9px; max-width: 100%; }
.dsh-search-screen__chipLabel { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.dsh-search-screen__chip { height: 30px; padding: 0 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12.5px; cursor: pointer; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease), color var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease), border-color var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__chip:hover { border-color: var(--dsw-alias-border-l3); background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__header { position: sticky; top: 0; z-index: 3; padding: calc(var(--dsh-frame-top-clearance, 0px) + 10px) 24px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent); backdrop-filter: blur(12px); }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__headerInner { flex-direction: row; flex-wrap: wrap; gap: 16px; max-width: 860px; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__brand { flex: none; margin: 0; padding: 4px 10px 4px 4px; border: none; border-radius: 999px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__brand:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__brandTile { width: 26px; height: 26px; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__brandText { flex-direction: row; align-items: center; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__title { font-size: 15px; line-height: 22px; font-weight: 600; letter-spacing: -0.2px; white-space: nowrap; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__subtitle { display: none; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__form { flex: 1 1 320px; min-width: 0; height: 44px; padding: 0 6px 0 14px; border-radius: 22px; box-shadow: none; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__searchIcon svg { width: 18px; height: 18px; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__input { font-size: 14px; }
.dsh-search-screen__page[data-mode='results'] .dsh-search-screen__submit { height: 34px; padding: 0 16px; font-size: 13px; }
.dsh-search-screen__results { box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 860px; margin: 0 auto; padding: 16px 24px 72px; }
.dsh-search-screen__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 2px 4px; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__metaQuery { color: var(--dsw-alias-label-primary); font-weight: 500; overflow-wrap: anywhere; }
.dsh-search-screen__metaDot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: 0.55; }
.dsh-search-screen__answer { box-sizing: border-box; padding: 16px 18px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 1px 2px var(--dsw-alias-bg-mask-2); }
.dsh-search-screen__answerHead { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__answerHeadIcon { display: inline-flex; color: var(--dsw-alias-state-business-primary); }
.dsh-search-screen__answerText { margin: 0; font-size: 14px; line-height: 23px; white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-search-screen__sources { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.dsh-search-screen__source { display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__source:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-search-screen__avatar { display: grid; flex: none; place-items: center; width: 26px; height: 26px; margin-top: 1px; border-radius: 8px; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 600; text-transform: uppercase; }
.dsh-search-screen__sourceBody { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.dsh-search-screen__sourceTitleRow { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
.dsh-search-screen__sourceTitle { flex: 0 1 auto; display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-link); font: inherit; font-size: 16px; line-height: 24px; font-weight: 500; text-align: start; cursor: pointer; overflow-wrap: anywhere; }
.dsh-search-screen__sourceTitle:hover { text-decoration: underline; }
.dsh-search-screen__sourceOpen { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; color: var(--dsw-alias-label-tertiary); opacity: 0; transition: opacity var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease), background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease), color var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__source:hover .dsh-search-screen__sourceOpen, .dsh-search-screen__sourceOpen:focus-visible { opacity: 1; }
.dsh-search-screen__sourceOpen:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-search-screen__sourceMeta { margin-top: 2px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); overflow-wrap: anywhere; }
.dsh-search-screen__sourceSnippet { display: -webkit-box; margin: 5px 0 0; overflow: hidden; font-size: 13.5px; line-height: 21px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.dsh-search-screen__foot { margin: 4px 0 0; padding-top: 12px; border-top: 0.5px solid var(--dsw-alias-border-l1); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.dsh-search-screen__empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 56px 16px 32px; text-align: center; }
.dsh-search-screen__emptyIcon { display: inline-flex; color: var(--dsw-alias-label-tertiary); opacity: 0.6; }
.dsh-search-screen__emptyTitle { margin: 0; font-size: 15px; line-height: 23px; font-weight: 500; }
.dsh-search-screen__emptyHint { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-search-screen__error { box-sizing: border-box; padding: 18px; border: 0.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); border-radius: 14px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 4%, transparent); }
.dsh-search-screen__errorHead { display: flex; align-items: center; gap: 8px; }
.dsh-search-screen__errorIcon { display: inline-flex; color: var(--dsw-alias-state-error-primary); }
.dsh-search-screen__errorTitle { margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; color: var(--dsw-alias-state-error-primary); }
.dsh-search-screen__errorMessage { margin: 8px 0 0; font-size: 13.5px; line-height: 21px; white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-search-screen__errorCode { display: inline-block; margin: 10px 0 0; padding: 2px 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 6px; font-family: var(--dsh-code-font-family, ui-monospace, monospace); font-size: 11.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__errorActions { display: flex; gap: 8px; margin-top: 14px; }
.dsh-search-screen__ghostButton { height: 36px; padding: 0 16px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; cursor: pointer; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__ghostButton:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-search-screen__errorActions .dsh-search-screen__submit { height: 36px; padding: 0 16px; border-radius: var(--dsw-radius-md, 8px); font-size: 13px; }
.dsh-search-screen__skeletonList { display: flex; flex-direction: column; gap: 8px; }
.dsh-search-screen__skeletonItem { display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; }
.dsh-search-screen__skeletonAvatar { flex: none; width: 26px; height: 26px; border-radius: 8px; background: var(--dsw-alias-bg-skeleton); animation: dsh-search-screen-pulse 1.4s ease-in-out infinite; }
.dsh-search-screen__skeletonLines { display: flex; flex: 1; flex-direction: column; gap: 8px; }
.dsh-search-screen__skeletonLine { height: 10px; border-radius: 5px; background: var(--dsw-alias-bg-skeleton); animation: dsh-search-screen-pulse 1.4s ease-in-out infinite; }
.dsh-search-screen__skeletonLine--title { width: 52%; height: 14px; }
.dsh-search-screen__skeletonLine--meta { width: 28%; }
.dsh-search-screen__skeletonLine--titleLg { width: 64%; height: 26px; }
.dsh-search-screen__skeletonLine--lead { width: 82%; }
.dsh-search-screen__readerBar { position: sticky; top: 0; z-index: 3; box-sizing: border-box; width: 100%; padding: calc(var(--dsh-frame-top-clearance, 0px) + 10px) 24px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent); backdrop-filter: blur(12px); }
.dsh-search-screen__readerBarInner { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 820px; margin: 0 auto; }
.dsh-search-screen__readerBack { display: inline-flex; flex: none; align-items: center; gap: 6px; height: 34px; padding: 0 14px 0 10px; }
.dsh-search-screen__readerSite { flex: 1; min-width: 0; overflow: hidden; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary); text-overflow: ellipsis; white-space: nowrap; }
.dsh-search-screen__readerOpen { display: inline-flex; flex: none; align-items: center; gap: 6px; height: 34px; padding: 0 14px; text-decoration: none; }
.dsh-search-screen__article { box-sizing: border-box; width: 100%; max-width: 820px; margin: 0 auto; padding: 32px 24px 96px; }
.dsh-search-screen__articleTitle { margin: 0; font-size: 30px; line-height: 40px; font-weight: 600; letter-spacing: -0.7px; overflow-wrap: anywhere; }
.dsh-search-screen__articleMeta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__articleLead { margin: 20px 0 0; padding-left: 14px; border-left: 2px solid var(--dsw-alias-border-l2); font-size: 15px; line-height: 25px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-search-screen__articleBody { margin-top: 22px; font-size: 15px; line-height: 27px; color: var(--dsw-alias-label-primary); }
.dsh-search-screen__articleBody p { margin: 0 0 16px; overflow-wrap: anywhere; }
.dsh-search-screen__articleH2 { margin: 32px 0 10px; font-size: 22px; line-height: 30px; font-weight: 600; letter-spacing: -0.3px; }
.dsh-search-screen__articleH3 { margin: 26px 0 8px; font-size: 18px; line-height: 26px; font-weight: 600; }
.dsh-search-screen__articleH4 { margin: 22px 0 6px; font-size: 15.5px; line-height: 24px; font-weight: 600; }
.dsh-search-screen__articleH5, .dsh-search-screen__articleH6 { margin: 18px 0 6px; font-size: 14.5px; line-height: 22px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-search-screen__articleList { margin: 0 0 16px; padding-left: 22px; }
.dsh-search-screen__articleList li { margin: 0 0 6px; overflow-wrap: anywhere; }
.dsh-search-screen__articleQuote { margin: 0 0 16px; padding: 2px 0 2px 14px; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.dsh-search-screen__articleCode { margin: 0 0 16px; padding: 14px 16px; overflow-x: auto; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); font-family: var(--dsh-code-font-family, ui-monospace, monospace); font-size: 13px; line-height: 21px; white-space: pre; }
.dsh-search-screen__articleCode code { font: inherit; }
.dsh-search-screen__articleFoot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 32px 0 0; padding-top: 14px; border-top: 0.5px solid var(--dsw-alias-border-l1); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__articleFoot a { color: var(--dsw-alias-link); text-decoration: none; }
.dsh-search-screen__articleFoot a:hover { text-decoration: underline; }
.dsh-search-screen__readerSkeleton { display: flex; flex-direction: column; gap: 14px; }
.dsh-search-screen__readerLoading { margin: 0; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.dsh-search-screen__submit:focus-visible, .dsh-search-screen__clear:focus-visible, .dsh-search-screen__chip:focus-visible, .dsh-search-screen__brand:focus-visible, .dsh-search-screen__ghostButton:focus-visible, .dsh-search-screen__sourceTitle:focus-visible, .dsh-search-screen__sourceOpen:focus-visible, .dsh-search-screen__readerBack:focus-visible, .dsh-search-screen__readerOpen:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
@keyframes dsh-search-screen-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
@media (max-width: 720px) {
  .dsh-search-screen__page[data-mode='hero'] .dsh-search-screen__header { padding-inline: 18px; padding-top: calc(var(--dsh-frame-top-clearance, 0px) + 48px); }
  .dsh-search-screen__headerInner { gap: 22px; }
  .dsh-search-screen__brand { gap: 12px; }
  .dsh-search-screen__brandTile { width: 40px; height: 40px; }
  .dsh-search-screen__title { font-size: 26px; line-height: 34px; letter-spacing: -0.5px; }
  .dsh-search-screen__form { height: 52px; padding: 0 6px 0 16px; }
  .dsh-search-screen__input { font-size: 15px; }
  .dsh-search-screen__submit { height: 40px; padding: 0 18px; }
  .dsh-search-screen__page[data-mode='results'] .dsh-search-screen__header { padding-inline: 16px; }
  .dsh-search-screen__page[data-mode='results'] .dsh-search-screen__headerInner { gap: 10px; }
  .dsh-search-screen__page[data-mode='results'] .dsh-search-screen__brand { padding: 4px; }
  .dsh-search-screen__page[data-mode='results'] .dsh-search-screen__brandText { display: none; }
  .dsh-search-screen__results { padding: 12px 16px 64px; }
  .dsh-search-screen__source { gap: 10px; padding: 10px 8px; }
  .dsh-search-screen__sourceTitle { font-size: 15px; line-height: 22px; }
  .dsh-search-screen__readerBar { padding-inline: 16px; }
  .dsh-search-screen__article { padding: 24px 18px 80px; }
  .dsh-search-screen__articleTitle { font-size: 25px; line-height: 34px; }
  .dsh-search-screen__articleBody { font-size: 14.5px; line-height: 26px; }
}
@media (max-width: 480px) {
  .dsh-search-screen__title { font-size: 24px; line-height: 32px; }
  .dsh-search-screen__subtitle { font-size: 12.5px; }
  .dsh-search-screen__hint { display: none; }
}
@media (hover: none) {
  .dsh-search-screen__sourceOpen { opacity: 0.7; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-search-screen__skeletonAvatar, .dsh-search-screen__skeletonLine { animation: none; }
  .dsh-search-screen__form, .dsh-search-screen__submit, .dsh-search-screen__clear, .dsh-search-screen__chip, .dsh-search-screen__source, .dsh-search-screen__brand, .dsh-search-screen__ghostButton, .dsh-search-screen__sourceOpen, .dsh-search-screen__readerBack, .dsh-search-screen__readerOpen { transition: none; }
}
`

    /** Localized page copy keyed by UI failure code. */
    const LOCAL_MESSAGES = {
      'network-error': 'error.offline',
      'invalid-response': 'error.badResponse',
      'invalid-query': 'error.invalidQuery',
      'query-too-long': 'error.tooLong',
      'search-timeout': 'error.timeout',
      'invalid-url': 'error.invalidUrl',
      'unsupported-protocol': 'error.protocol',
      'private-host': 'error.privateHost',
      'fetch-failed': 'error.fetchFailed',
      'page-timeout': 'error.pageTimeout',
      'page-too-large': 'error.tooLarge',
      'unsupported-content': 'error.unsupportedType',
      'page-failed': 'error.pageFailed',
    }

    /**
     * Build a thrown failure carrying the stable code the page renders.
     * @param code - machine-routable failure code.
     * @param message - upstream explanation, possibly empty.
     * @returns the error to throw.
     */
    function codedError(code, message) {
      const error = new Error(message)
      error.code = code
      return error
    }

    /**
     * Run one query through the package's Host route.
     * @param query - trimmed query text.
     * @param signal - cancellation for a superseded or unmounted search.
     * @returns the Host's success payload.
     * @throws an Error carrying `code` and `message` on any failure.
     */
    async function requestSearch(query, signal) {
      let response
      try {
        response = await fetch(`${SEARCH_ROUTE}?q=${encodeURIComponent(query)}`, {
          signal,
          headers: { accept: 'application/json' },
        })
      } catch (error) {
        if (signal?.aborted === true) throw error
        throw codedError('network-error', '')
      }
      let payload
      try {
        payload = await response.json()
      } catch (error) {
        if (signal?.aborted === true) throw error
        throw codedError('invalid-response', '')
      }
      if (payload?.ok === true) return payload
      const code = typeof payload?.error?.code === 'string' ? payload.error.code : `http-${String(response.status)}`
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : ''
      throw codedError(code, message)
    }

    /**
     * Read one page through the package's reader route.
     * @param url - absolute HTTP(S) page address.
     * @param signal - cancellation for a superseded or unmounted read.
     * @returns the Host's reader payload.
     * @throws an Error carrying `code` and `message` on any failure.
     */
    async function requestPage(url, signal) {
      let response
      try {
        response = await fetch(`${PAGE_ROUTE}?url=${encodeURIComponent(url)}`, {
          signal,
          headers: { accept: 'application/json' },
        })
      } catch (error) {
        if (signal?.aborted === true) throw error
        throw codedError('network-error', '')
      }
      let payload
      try {
        payload = await response.json()
      } catch (error) {
        if (signal?.aborted === true) throw error
        throw codedError('invalid-response', '')
      }
      if (payload?.ok === true) {
        if (Array.isArray(payload.blocks)) return payload
        throw codedError('invalid-response', '')
      }
      const code = typeof payload?.error?.code === 'string' ? payload.error.code : `http-${String(response.status)}`
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : ''
      throw codedError(code, message)
    }

    /**
     * Resolve the message a failure shows, preferring page copy for codes the
     * page knows and the Host's own explanation otherwise.
     * @param failure - rendered failure state.
     * @param t - translate seat of this page's namespace.
     * @returns the localized message.
     */
    function messageFor(failure, t) {
      const key = LOCAL_MESSAGES[failure?.code ?? '']
      if (key === 'error.tooLong') return t(key, { max: MAX_QUERY_LENGTH })
      if (key !== undefined) return t(key)
      return failure?.message !== undefined && failure.message !== '' ? failure.message : t('error.unknown')
    }

    /**
     * Read the host of a result URL for the metadata line.
     * @param url - result URL.
     * @returns its host, or the URL as written when it cannot parse.
     */
    function hostOf(url) {
      try {
        return new URL(url).host
      } catch {
        // A provider URL that cannot parse still has to render as text.
        return url
      }
    }

    /**
     * Format a publication date for the metadata line.
     * @param publishedAt - provider-supplied ISO-8601 text.
     * @param locale - active dsh locale id, so the date follows the UI language.
     * @returns the local date, or undefined when it cannot parse.
     */
    function dateOf(publishedAt, locale) {
      const date = new Date(publishedAt)
      return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString(locale)
    }

    /**
     * Format the Host's elapsed milliseconds as one decimal second.
     * @param tookMs - elapsed milliseconds.
     * @returns the seconds text the metadata line shows.
     */
    function secondsOf(tookMs) {
      return Math.max(0.1, tookMs / 1000).toFixed(1)
    }

    /**
     * The monochrome magnifier used by the sidebar entry and the search field.
     * @param props - requested square edge.
     * @returns the SVG element.
     */
    function SearchGlyph({ size }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      },
      h('circle', { cx: 10.5, cy: 10.5, r: 6.4, stroke: 'currentColor', strokeWidth: 1.8 }),
      h('path', { d: 'M15.3 15.3 20.4 20.4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }))
    }

    /**
     * The page's own brand tile: the plugin artwork sized by the surrounding
     * element. It draws with its own colors because it is artwork, not a themed
     * control.
     * @returns the SVG element.
     */
    function BrandTile() {
      return h('svg', {
        viewBox: '0 0 64 64', width: '100%', height: '100%', fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      },
      h('rect', { x: 2, y: 2, width: 60, height: 60, rx: 16, fill: '#4D6BFE' }),
      h('circle', { cx: 27.5, cy: 27.5, r: 10.5, stroke: '#FFFFFF', strokeWidth: 4 }),
      h('path', { d: 'M35.5 35.5 45.5 45.5', stroke: '#FFFFFF', strokeWidth: 4, strokeLinecap: 'round' }),
      h('circle', { cx: 23.5, cy: 23.5, r: 2.6, fill: '#FFFFFF', opacity: 0.75 }))
    }

    /**
     * The summary mark beside the answer card's label.
     * @param props - requested square edge.
     * @returns the SVG element.
     */
    function SparkleIcon({ size }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor',
        'aria-hidden': 'true', focusable: 'false',
      }, h('path', {
        d: 'M12 2.5c.8 4.9 3.9 8 8.8 8.8-4.9.8-8 3.9-8.8 8.8-.8-4.9-3.9-8-8.8-8.8 4.9-.8 8-3.9 8.8-8.8Z',
      }))
    }

    /** The failure mark beside the error card's title. */
    function WarningIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      },
      h('circle', { cx: 12, cy: 12, r: 9, stroke: 'currentColor', strokeWidth: 1.8 }),
      h('path', { d: 'M12 7.5v5.2', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
      h('circle', { cx: 12, cy: 16.4, r: 1.1, fill: 'currentColor' }))
    }

    /** The "opens in a new tab" mark trailing a result title. */
    function ExternalIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      }, h('path', {
        d: 'M7 17 17 7M9.5 7H17v7.5', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    /** The arrow that returns from the reader to the results list. */
    function BackIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      }, h('path', {
        d: 'M14.5 6 8.5 12l6 6', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    /**
     * Render the failure card shared by the search and reader outcomes.
     * @param props - the failure, the page's translate seat, the card title and
     *   message, and the action buttons.
     * @returns the card element.
     */
    function FailureCard({ failure, t, title, message, actions }) {
      return h('div', { className: 'dsh-search-screen__error', role: 'alert' },
        h('div', { className: 'dsh-search-screen__errorHead' },
          h('span', { className: 'dsh-search-screen__errorIcon' }, h(WarningIcon)),
          h('p', { className: 'dsh-search-screen__errorTitle' }, title)),
        h('p', { className: 'dsh-search-screen__errorMessage' }, message),
        failure?.code === undefined ? null : h('code', {
          className: 'dsh-search-screen__errorCode',
        }, failure.code),
        h('div', { className: 'dsh-search-screen__errorActions' }, actions))
    }

    /**
     * Render the reader's block list: consecutive list items share one list,
     * and the article's headings sit one level below the page title.
     * @param blocks - blocks returned by the reader route.
     * @returns the elements to place in the article body.
     */
    function renderBlocks(blocks) {
      const children = []
      let list = null
      blocks.forEach((block, index) => {
        if (block.kind === 'listItem') {
          if (list === null) {
            list = []
            children.push(h('ul', {
              key: `list:${String(index)}`,
              className: 'dsh-search-screen__articleList',
            }, list))
          }
          list.push(h('li', { key: `item:${String(index)}` }, block.text))
          return
        }
        list = null
        if (block.kind === 'heading') {
          const level = Math.min(6, Math.max(2, (Number(block.level) || 2) + 1))
          children.push(h(`h${String(level)}`, {
            key: `block:${String(index)}`,
            className: `dsh-search-screen__articleH${String(level)}`,
          }, block.text))
          return
        }
        if (block.kind === 'code') {
          children.push(h('pre', {
            key: `block:${String(index)}`,
            className: 'dsh-search-screen__articleCode',
          }, h('code', null, block.text)))
          return
        }
        if (block.kind === 'quote') {
          children.push(h('blockquote', {
            key: `block:${String(index)}`,
            className: 'dsh-search-screen__articleQuote',
          }, block.text))
          return
        }
        children.push(h('p', { key: `block:${String(index)}` }, block.text))
      })
      return children
    }

    /**
     * Sidebar entry icon; the sidebar owns the button around it.
     * @param props - the sidebar's icon share.
     * @returns the glyph.
     */
    function PanelIcon(props) {
      return h(SearchGlyph, { size: props.size })
    }

    /**
     * The search page: the hero search box and example queries before a search,
     * then a sticky toolbar over the answer and its citeable sources, with the
     * loading, empty, and failure states. Opening one source swaps the page for
     * a reader view of that page, fetched through the Host's reader route.
     * @param props - the main-panel seat: `t`, the injected search and read
     * operations, the remembered queries, and the framework's panel-selection
     * hook.
     * @returns the page element.
     */
    function SearchPage(props) {
      const t = props.t
      const search = props.search
      const read = props.read
      const activeLocale = props.activeLocale
      const readRecent = props.recentQueries
      const rememberQuery = props.rememberQuery
      const [draft, setDraft] = useState('')
      const [status, setStatus] = useState('idle')
      const [outcome, setOutcome] = useState(null)
      const [failure, setFailure] = useState(null)
      const [view, setView] = useState('search')
      const [reading, setReading] = useState(null)
      const [recent, setRecent] = useState(() => typeof readRecent === 'function' ? readRecent() : [])
      const inputRef = useRef(null)
      const requestRef = useRef(null)
      const pageRef = useRef(null)
      const backRef = useRef(null)
      const rootRef = useRef(null)
      const resultsScrollRef = useRef(0)
      const composingRef = useRef(false)
      // The renderer supplies this hook; the plain return keeps the test render
      // (which passes no framework hooks) on the same hook order.
      const activePanelId = typeof props.usePanelInfo === 'function'
        ? props.usePanelInfo(info => info.activePanelId)
        : null

      const focusInput = useCallback(() => {
        inputRef.current?.focus()
      }, [])

      useEffect(() => {
        focusInput()
        return () => {
          requestRef.current?.abort()
          pageRef.current?.abort()
        }
      }, [focusInput])

      // Entering the reader starts at the top of the article and lands on the
      // back control; leaving it puts the results list back where it was and
      // lands in the field, so both directions keep scroll and keyboard work.
      useEffect(() => {
        const root = rootRef.current
        if (view === 'reader') {
          if (root !== null) root.scrollTop = 0
          backRef.current?.focus()
          return
        }
        if (root !== null) root.scrollTop = resultsScrollRef.current
        focusInput()
      }, [view, focusInput])

      // Re-entering the panel from the sidebar lands in the search field.
      useEffect(() => {
        if (activePanelId === PANEL_ID) focusInput()
      }, [activePanelId, focusInput])

      const remember = useCallback((query) => {
        if (typeof rememberQuery === 'function') {
          rememberQuery(query)
          setRecent(typeof readRecent === 'function' ? readRecent() : [])
          return
        }
        setRecent(previous => [query, ...previous.filter(item => item !== query)].slice(0, RECENT_LIMIT))
      }, [readRecent, rememberQuery])

      const goHome = useCallback(() => {
        requestRef.current?.abort()
        requestRef.current = null
        setStatus('idle')
        setOutcome(null)
        setFailure(null)
        setDraft('')
        focusInput()
      }, [focusInput])

      const closeReader = useCallback(() => {
        pageRef.current?.abort()
        pageRef.current = null
        setView('search')
        setReading(null)
      }, [])

      const openReader = useCallback(async (source) => {
        pageRef.current?.abort()
        const controller = new AbortController()
        pageRef.current = controller
        // A retry keeps the results list's own position, so only a fresh open
        // remembers where the reader was entered from.
        if (view !== 'reader') resultsScrollRef.current = rootRef.current?.scrollTop ?? 0
        setView('reader')
        setReading({ status: 'loading', source, page: null, failure: null })
        try {
          const payload = await read(source.url, controller.signal)
          if (controller.signal.aborted) return
          setReading({ status: 'done', source, page: payload, failure: null })
        } catch (error) {
          if (controller.signal.aborted) return
          setReading({
            status: 'error',
            source,
            page: null,
            failure: {
              code: typeof error?.code === 'string' ? error.code : 'network-error',
              message: typeof error?.message === 'string' ? error.message : '',
            },
          })
        } finally {
          if (pageRef.current === controller) pageRef.current = null
        }
      }, [read, view])

      const onReaderKeyDown = useCallback((event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        closeReader()
      }, [closeReader])

      const runSearch = useCallback(async (rawQuery) => {
        const query = String(rawQuery ?? '').trim()
        if (query === '') {
          focusInput()
          return
        }
        requestRef.current?.abort()
        if (query.length > MAX_QUERY_LENGTH) {
          setDraft(query)
          setFailure({ code: 'query-too-long', message: '' })
          setStatus('error')
          return
        }
        const controller = new AbortController()
        requestRef.current = controller
        setDraft(query)
        setOutcome(null)
        setFailure(null)
        setStatus('loading')
        remember(query)
        try {
          const payload = await search(query, controller.signal)
          if (controller.signal.aborted) return
          setOutcome(payload)
          setStatus('done')
        } catch (error) {
          if (controller.signal.aborted) return
          setFailure({
            code: typeof error?.code === 'string' ? error.code : 'network-error',
            message: typeof error?.message === 'string' ? error.message : '',
          })
          setStatus('error')
        } finally {
          if (requestRef.current === controller) requestRef.current = null
        }
      }, [focusInput, remember, search])

      const onSubmit = useCallback((event) => {
        event.preventDefault()
        // An Enter that confirms an IME composition belongs to the input method.
        if (composingRef.current) return
        void runSearch(draft)
      }, [draft, runSearch])

      const onInputKeyDown = useCallback((event) => {
        if (event.key === 'Escape') {
          if (draft !== '') {
            event.preventDefault()
            setDraft('')
            return
          }
          if (status !== 'idle') {
            event.preventDefault()
            goHome()
          }
          return
        }
        if (event.key === 'Enter' && !composingRef.current) {
          event.preventDefault()
          void runSearch(draft)
        }
      }, [draft, goHome, runSearch, status])

      const runExample = useCallback((query) => {
        setDraft(query)
        void runSearch(query)
      }, [runSearch])

      const clearDraft = useCallback(() => {
        setDraft('')
        focusInput()
      }, [focusInput])

      const compact = status !== 'idle'
      const sources = outcome?.sources ?? []
      const language = typeof activeLocale === 'function' ? String(activeLocale()) : 'en'
      const examples = language.startsWith('zh') ? EXAMPLES.zh : EXAMPLES.en
      const mode = view === 'reader' ? 'reader' : compact ? 'results' : 'hero'

      const form = h('form', {
        className: 'dsh-search-screen__form',
        role: 'search',
        'aria-label': t('formAria'),
        onSubmit,
      },
      h('span', { className: 'dsh-search-screen__searchIcon' }, h(SearchGlyph, { size: 20 })),
      h('input', {
        ref: inputRef,
        className: 'dsh-search-screen__input',
        type: 'text',
        value: draft,
        placeholder: t('placeholder'),
        'aria-label': t('placeholder'),
        autoComplete: 'off',
        autoCorrect: 'off',
        autoCapitalize: 'off',
        spellCheck: false,
        enterKeyHint: 'search',
        maxLength: MAX_QUERY_LENGTH,
        onChange: event => { setDraft(event.target.value) },
        onKeyDown: onInputKeyDown,
        onCompositionStart: () => { composingRef.current = true },
        onCompositionEnd: () => { composingRef.current = false },
      }),
      draft === '' ? null : h('button', {
        className: 'dsh-search-screen__clear',
        type: 'button',
        'aria-label': t('clear'),
        onClick: clearDraft,
      }, h('svg', {
        viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      }, h('path', { d: 'M17 7 7 17M7 7l10 10', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }))),
      h('button', {
        className: 'dsh-search-screen__submit',
        type: 'submit',
        disabled: status === 'loading' || draft.trim() === '',
      }, status === 'loading' ? t('searching') : t('search')))

      // The brand and the form keep their positions and element types across
      // modes, so switching between the hero and the results toolbar never
      // remounts the field or drops its focus.
      const brand = compact
        ? h('button', {
          className: 'dsh-search-screen__brand',
          type: 'button',
          onClick: goHome,
          'aria-label': t('backHome'),
        },
        h('span', { className: 'dsh-search-screen__brandTile' }, h(BrandTile)),
        h('span', { className: 'dsh-search-screen__brandText' },
          h('span', { className: 'dsh-search-screen__title' }, t('title'))))
        : h('div', { className: 'dsh-search-screen__brand' },
          h('span', { className: 'dsh-search-screen__brandTile' }, h(BrandTile)),
          h('div', { className: 'dsh-search-screen__brandText' },
            h('h1', { className: 'dsh-search-screen__title' }, t('title')),
            h('p', { className: 'dsh-search-screen__subtitle' }, t('subtitle'))))

      const heroExtras = compact ? null : h(React.Fragment, null,
        h('div', { className: 'dsh-search-screen__hint' },
          h('span', { className: 'dsh-search-screen__hintItem' },
            h('kbd', { className: 'dsh-search-screen__kbd' }, 'Enter'), t('hint.enter')),
          h('span', { className: 'dsh-search-screen__hintItem' },
            h('kbd', { className: 'dsh-search-screen__kbd' }, 'Esc'), t('hint.esc'))),
        h('div', { className: 'dsh-search-screen__suggestions' },
          h('div', { className: 'dsh-search-screen__chipGroup' },
            h('p', { className: 'dsh-search-screen__chipLabel' }, t('heroExamples')),
            h('div', { className: 'dsh-search-screen__chips' }, examples.map(query => h('button', {
              key: `example:${query}`,
              className: 'dsh-search-screen__chip',
              type: 'button',
              onClick: () => { runExample(query) },
            }, query)))),
          recent.length === 0 ? null : h('div', { className: 'dsh-search-screen__chipGroup' },
            h('p', { className: 'dsh-search-screen__chipLabel' }, t('heroRecent')),
            h('div', { className: 'dsh-search-screen__chips' }, recent.map(query => h('button', {
              key: `recent:${query}`,
              className: 'dsh-search-screen__chip',
              type: 'button',
              onClick: () => { runExample(query) },
            }, query))))))

      const header = h('div', { className: 'dsh-search-screen__header' },
        h('div', { className: 'dsh-search-screen__headerInner' },
          brand,
          form,
          heroExtras))

      const statusText = view === 'reader'
        ? reading?.status === 'loading'
          ? t('reader.loading')
          : reading?.status === 'error' ? t('reader.failed') : ''
        : status === 'loading'
          ? t('searching')
          : status === 'done'
            ? t('results.count', { count: sources.length })
            : status === 'error' ? t('error.title') : ''

      const results = h('div', {
        className: 'dsh-search-screen__results',
        'aria-busy': status === 'loading',
      }, status === 'loading'
        ? h('div', { className: 'dsh-search-screen__skeletonList', 'aria-hidden': 'true' },
          Array.from({ length: 4 }, (_, index) => h('div', {
            key: index, className: 'dsh-search-screen__skeletonItem',
          },
          h('div', { className: 'dsh-search-screen__skeletonAvatar' }),
          h('div', { className: 'dsh-search-screen__skeletonLines' },
            h('div', { className: 'dsh-search-screen__skeletonLine dsh-search-screen__skeletonLine--title' }),
            h('div', { className: 'dsh-search-screen__skeletonLine dsh-search-screen__skeletonLine--meta' }),
            h('div', { className: 'dsh-search-screen__skeletonLine' })))))
        : status === 'error'
          ? h(FailureCard, {
            failure,
            t,
            title: t('error.title'),
            message: messageFor(failure, t),
            actions: [
              h('button', {
                key: 'retry',
                className: 'dsh-search-screen__submit',
                type: 'button',
                onClick: () => { void runSearch(draft) },
              }, t('error.retry')),
              h('button', {
                key: 'home',
                className: 'dsh-search-screen__ghostButton',
                type: 'button',
                onClick: goHome,
              }, t('error.home')),
            ],
          })
          : h(React.Fragment, null,
            h('div', { className: 'dsh-search-screen__meta' },
              h('span', { className: 'dsh-search-screen__metaQuery' }, t('results.query', { query: outcome?.query ?? '' })),
              h('span', { className: 'dsh-search-screen__metaDot' }),
              h('span', null, t('results.count', { count: sources.length })),
              typeof outcome?.tookMs !== 'number' ? null : h(React.Fragment, null,
                h('span', { className: 'dsh-search-screen__metaDot' }),
                h('span', null, t('results.time', { seconds: secondsOf(outcome.tookMs) }))),
              outcome?.truncated !== true ? null : h(React.Fragment, null,
                h('span', { className: 'dsh-search-screen__metaDot' }),
                h('span', null, t('results.truncated')))),
            outcome?.answer === undefined ? null : h('section', { className: 'dsh-search-screen__answer' },
              h('p', { className: 'dsh-search-screen__answerHead' },
                h('span', { className: 'dsh-search-screen__answerHeadIcon' }, h(SparkleIcon, { size: 13 })),
                h('span', null, t('answer.label'))),
              h('p', { className: 'dsh-search-screen__answerText' }, outcome.answer)),
            sources.length === 0
              ? h('div', { className: 'dsh-search-screen__empty' },
                h('span', { className: 'dsh-search-screen__emptyIcon' }, h(SearchGlyph, { size: 28 })),
                h('p', { className: 'dsh-search-screen__emptyTitle' }, t('empty.title')),
                h('p', { className: 'dsh-search-screen__emptyHint' }, t('empty.hint')))
              : h('ol', { className: 'dsh-search-screen__sources' }, sources.map((source, index) => h('li', {
                key: `${source.url}#${String(index)}`,
                className: 'dsh-search-screen__source',
              },
              h('span', { className: 'dsh-search-screen__avatar', 'aria-hidden': 'true' },
                (hostOf(source.url).replace(/^www\./u, '').charAt(0) || '?')),
              h('span', { className: 'dsh-search-screen__sourceBody' },
                h('span', { className: 'dsh-search-screen__sourceTitleRow' },
                  h('button', {
                    className: 'dsh-search-screen__sourceTitle',
                    type: 'button',
                    title: t('read'),
                    onClick: () => { void openReader(source) },
                  },
                  h('span', null, source.title !== undefined && source.title !== '' ? source.title : hostOf(source.url))),
                  h('a', {
                    className: 'dsh-search-screen__sourceOpen',
                    href: source.url,
                    target: '_blank',
                    rel: 'noreferrer noopener',
                    title: t('open'),
                    'aria-label': t('open'),
                  }, h(ExternalIcon))),
                h('span', { className: 'dsh-search-screen__sourceMeta' }, [
                  hostOf(source.url),
                  source.publishedAt === undefined ? undefined : dateOf(source.publishedAt, language),
                ].filter(part => part !== undefined && part !== '').join(' · ')),
                source.snippet === undefined || source.snippet === ''
                  ? null
                  : h('p', { className: 'dsh-search-screen__sourceSnippet' }, source.snippet))))),
            h('p', { className: 'dsh-search-screen__foot' }, t('foot', {
              max: outcome?.maxResults ?? sources.length,
            }))))

      const readingPage = reading?.page ?? null
      const readerTitle = readingPage?.title !== undefined && readingPage.title !== ''
        ? readingPage.title
        : reading?.source?.title !== undefined && reading.source.title !== ''
          ? reading.source.title
          : hostOf(reading?.source?.url ?? '')
      const reader = reading === null ? null : h(React.Fragment, null,
        h('div', { className: 'dsh-search-screen__readerBar' },
          h('div', { className: 'dsh-search-screen__readerBarInner' },
            h('button', {
              ref: backRef,
              className: 'dsh-search-screen__ghostButton dsh-search-screen__readerBack',
              type: 'button',
              onClick: closeReader,
            }, h(BackIcon), t('reader.back')),
            h('span', { className: 'dsh-search-screen__readerSite' }, hostOf(reading.source.url)),
            h('a', {
              className: 'dsh-search-screen__ghostButton dsh-search-screen__readerOpen',
              href: reading.source.url,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, t('open'), h(ExternalIcon)))),
        h('article', { className: 'dsh-search-screen__article' },
          reading.status === 'loading'
            ? h('div', { className: 'dsh-search-screen__readerSkeleton', 'aria-busy': 'true' },
              h('p', { className: 'dsh-search-screen__readerLoading' }, t('reader.loading')),
              h('div', { className: 'dsh-search-screen__skeletonLine dsh-search-screen__skeletonLine--titleLg' }),
              h('div', { className: 'dsh-search-screen__skeletonLine' }),
              h('div', { className: 'dsh-search-screen__skeletonLine dsh-search-screen__skeletonLine--lead' }),
              h('div', { className: 'dsh-search-screen__skeletonLine' }),
              h('div', { className: 'dsh-search-screen__skeletonLine dsh-search-screen__skeletonLine--lead' }))
            : reading.status === 'error'
              ? h(FailureCard, {
                failure: reading.failure,
                t,
                title: t('reader.failed'),
                message: messageFor(reading.failure, t),
                actions: [
                  h('button', {
                    key: 'retry',
                    className: 'dsh-search-screen__submit',
                    type: 'button',
                    onClick: () => { void openReader(reading.source) },
                  }, t('error.retry')),
                  h('button', {
                    key: 'back',
                    className: 'dsh-search-screen__ghostButton',
                    type: 'button',
                    onClick: closeReader,
                  }, t('reader.back')),
                  h('a', {
                    key: 'original',
                    className: 'dsh-search-screen__ghostButton',
                    href: reading.source.url,
                    target: '_blank',
                    rel: 'noreferrer noopener',
                  }, t('reader.original')),
                ],
              })
              : h(React.Fragment, null,
                h('h1', { className: 'dsh-search-screen__articleTitle' }, readerTitle),
                h('p', { className: 'dsh-search-screen__articleMeta' },
                  h('span', null, hostOf(readingPage?.url ?? reading.source.url)),
                  typeof readingPage?.chars !== 'number' ? null : h(React.Fragment, null,
                    h('span', { className: 'dsh-search-screen__metaDot' }),
                    h('span', null, t('reader.words', { count: readingPage.chars.toLocaleString(language) }))),
                  readingPage?.truncated !== true ? null : h(React.Fragment, null,
                    h('span', { className: 'dsh-search-screen__metaDot' }),
                    h('span', null, t('reader.truncated')))),
                readingPage?.description === undefined ? null : h('p', {
                  className: 'dsh-search-screen__articleLead',
                }, readingPage.description),
                readingPage.blocks.length === 0
                  ? h('p', { className: 'dsh-search-screen__readerLoading' }, t('reader.empty'))
                  : h('div', { className: 'dsh-search-screen__articleBody' }, renderBlocks(readingPage.blocks)),
                h('p', { className: 'dsh-search-screen__articleFoot' },
                  h('a', {
                    href: readingPage.url,
                    target: '_blank',
                    rel: 'noreferrer noopener',
                  }, t('reader.original')),
                  h('span', null, t('reader.note'))))))

      return h('div', {
        ref: rootRef,
        className: 'dsh-search-screen__page',
        'data-mode': mode,
        ...view === 'reader' ? { onKeyDown: onReaderKeyDown } : {},
      },
      h('style', { key: 'style' }, CSS),
      h('div', { className: 'dsh-search-screen__sr', role: 'status', 'aria-live': 'polite' }, statusText),
      view === 'reader' ? reader : h(React.Fragment, null, header, compact ? results : null))
    }

    /**
     * Register the sidebar entry, the page, this plugin's dictionaries, and the
     * in-page memory of recent queries.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'search-screen: zh dictionary')
      ctx.effect(() => ctx.locale.register(NS, 'en', en), 'search-screen: en dictionary')
      const t = ctx.locale.bind(NS)
      // Recent queries belong to this plugin instance so they survive the panel
      // unmounting when the user visits a conversation.
      const recentQueries = []
      const face = {
        search: (query, signal) => requestSearch(query, signal),
        read: (url, signal) => requestPage(url, signal),
        activeLocale: () => ctx.locale.getLocale().active,
        recentQueries: () => recentQueries.slice(),
        rememberQuery: (query) => {
          recentQueries.splice(0, recentQueries.length, query,
            ...recentQueries.filter(item => item !== query).slice(0, RECENT_LIMIT - 1))
        },
      }
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => face,
      }, SearchPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 5,
        label: () => t('panel'),
      }, PanelIcon))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
