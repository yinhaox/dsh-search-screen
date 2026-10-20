/**
 * dsh-search-screen browser half: the sidebar entry that opens a full-window
 * search page, and the page itself.
 *
 * The page calls this package's Host route (`/search-screen/search`), which runs
 * the query through the composition's web seam (`ctx.web`) — the same provider
 * selection the model-facing `web_search` tool uses. Rendering follows the host
 * theme tokens; no Harness Client package is imported, so a Harness upgrade
 * cannot blank this entry.
 */

window.__ModuleLoader__.load({
  id: 'dsh-search-screen',
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
    /** Longest query the page submits; the Host route enforces the same bound. */
    const MAX_QUERY_LENGTH = 500
    /** Queries kept in the page's own recents list. */
    const RECENT_LIMIT = 6

    const zh = {
      'panel': '搜索',
      'title': 'DeepSeek 搜索',
      'subtitle': '用 DeepSeek 搜索服务查找全网信息',
      'placeholder': '输入搜索内容，按 Enter 搜索',
      'search': '搜索',
      'searching': '搜索中…',
      'formAria': '搜索',
      'heroExamples': '试试这些',
      'heroRecent': '最近搜索',
      'backHome': '回到搜索首页',
      'results.count': '{count} 条结果',
      'results.empty': '没有找到相关结果，换个关键词试试',
      'results.truncated': '结果已按上限截断',
      'answer.label': 'DeepSeek 摘要',
      'error.title': '搜索失败',
      'error.retry': '重试',
      'error.unknown': '发生未知错误，请稍后重试。',
      'error.offline': '无法连接到 DSH 宿主，请确认服务仍在运行。',
      'error.invalidQuery': '请输入搜索内容。',
      'error.tooLong': '搜索内容不能超过 {max} 个字符。',
      'error.timeout': '搜索超时，请稍后重试，或稍后缩小搜索范围。',
      'foot': '结果由 DeepSeek 搜索服务提供，最多 {max} 条。',
    }
    const en = {
      'panel': 'Search',
      'title': 'DeepSeek Search',
      'subtitle': 'Search the web through the DeepSeek search service',
      'placeholder': 'Search the web, press Enter',
      'search': 'Search',
      'searching': 'Searching…',
      'formAria': 'Search',
      'heroExamples': 'Try one of these',
      'heroRecent': 'Recent searches',
      'backHome': 'Back to the search home',
      'results.count': '{count} results',
      'results.empty': 'No results. Try another query.',
      'results.truncated': 'Results were cut to the configured limit',
      'answer.label': 'DeepSeek summary',
      'error.title': 'Search failed',
      'error.retry': 'Retry',
      'error.unknown': 'Something unexpected happened. Try again.',
      'error.offline': 'Cannot reach the DSH host. Check that the service is still running.',
      'error.invalidQuery': 'Enter a search query.',
      'error.tooLong': 'The query cannot exceed {max} characters.',
      'error.timeout': 'The search timed out. Try again with a narrower query.',
      'foot': 'Results come from the DeepSeek search service, at most {max}.',
    }
    /** Example queries offered on the empty search page. */
    const EXAMPLES = {
      zh: ['DeepSeek Harness', 'Cordis 插件系统', 'DeepSeek 最新模型', 'Rust 异步编程'],
      en: ['DeepSeek Harness', 'Cordis plugin system', 'DeepSeek latest model', 'Rust async'],
    }

    const CSS = `
.dsh-search-screen__page { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; height: 100%; overflow-y: auto; padding: calc(var(--dsh-frame-top-clearance, 0px) + 24px) clamp(20px, 5vw, 56px) 56px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: var(--dsh-content-font-size, 14px); }
.dsh-search-screen__hero { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 22px; width: 100%; max-width: 760px; padding-bottom: 20px; }
.dsh-search-screen__page[data-mode='hero'] .dsh-search-screen__hero { padding-top: clamp(48px, 15vh, 176px); padding-bottom: 36px; }
.dsh-search-screen__brand { display: flex; align-items: center; gap: 14px; }
.dsh-search-screen__brand--compact { align-self: flex-start; margin: 0 0 2px; padding: 0; border: none; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.dsh-search-screen__brand--compact:hover .dsh-search-screen__title { color: var(--dsw-alias-brand-primary); }
.dsh-search-screen__brand--compact:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 4px; }
.dsh-search-screen__mark { display: inline-flex; flex: none; color: var(--dsw-alias-brand-primary); }
.dsh-search-screen__brand-text { display: flex; flex-direction: column; }
.dsh-search-screen__title { margin: 0; font-size: 30px; line-height: 38px; font-weight: 600; letter-spacing: -0.4px; transition: color var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__title--compact { font-size: 16px; line-height: 24px; font-weight: 500; letter-spacing: 0; }
.dsh-search-screen__subtitle { margin: 4px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-search-screen__form { position: relative; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; height: 56px; padding: 0 6px 0 18px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); transition: border-color var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__form:focus-within { border-color: var(--dsw-alias-state-business-primary); }
.dsh-search-screen__page[data-mode='compact'] .dsh-search-screen__form { height: 48px; }
.dsh-search-screen__search-icon { display: inline-flex; flex: none; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__input { flex: 1; min-width: 0; height: 100%; padding: 0; border: none; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 15px; }
.dsh-search-screen__input::placeholder { color: var(--dsw-alias-label-dimmed); }
.dsh-search-screen__submit { flex: none; height: 40px; padding: 0 20px; border: none; border-radius: 999px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__submit:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-search-screen__submit:disabled { cursor: default; opacity: 0.5; }
.dsh-search-screen__submit:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-search-screen__page[data-mode='compact'] .dsh-search-screen__submit { height: 36px; padding: 0 16px; }
.dsh-search-screen__suggestions { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.dsh-search-screen__chip-group { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.dsh-search-screen__chip-label { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__chip { padding: 5px 12px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12.5px; line-height: 18px; cursor: pointer; }
.dsh-search-screen__chip:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-search-screen__chip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-search-screen__results { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 760px; padding-bottom: 40px; }
.dsh-search-screen__answer { box-sizing: border-box; padding: 14px 18px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
.dsh-search-screen__card-label { margin: 0 0 6px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__answer-text { margin: 0; font-size: 14px; line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-search-screen__sources { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.dsh-search-screen__source { padding: 12px 14px; border-radius: 12px; transition: background var(--ds-transition-duration, 150ms) var(--ds-ease-in-out, ease); }
.dsh-search-screen__source:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-search-screen__source-title { display: block; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-link); text-decoration: none; overflow-wrap: anywhere; }
.dsh-search-screen__source-title:hover { text-decoration: underline; }
.dsh-search-screen__source-title:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-search-screen__source-meta { margin-top: 2px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); overflow-wrap: anywhere; }
.dsh-search-screen__source-snippet { display: -webkit-box; margin: 6px 0 0; overflow: hidden; font-size: 13.5px; line-height: 21px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.dsh-search-screen__empty { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__foot { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.dsh-search-screen__skeleton-list { display: flex; flex-direction: column; gap: 10px; }
.dsh-search-screen__skeleton { height: 78px; border-radius: 12px; background: var(--dsw-alias-bg-skeleton); animation: dsh-search-screen-pulse 1.4s ease-in-out infinite; }
.dsh-search-screen__error { box-sizing: border-box; padding: 16px 18px; border: 0.5px solid var(--dsw-alias-state-error-primary); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
.dsh-search-screen__error-title { margin: 0; font-size: 14px; line-height: 22px; font-weight: 600; color: var(--dsw-alias-state-error-primary); }
.dsh-search-screen__error-message { margin: 6px 0 0; font-size: 13px; line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-search-screen__error-code { margin: 8px 0 0; font-family: var(--dsh-code-font-family, ui-monospace, monospace); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-search-screen__error-actions { display: flex; gap: 8px; margin-top: 12px; }
.dsh-search-screen__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@keyframes dsh-search-screen-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.55 } }
@media (prefers-reduced-motion: reduce) {
  .dsh-search-screen__skeleton { animation: none; }
  .dsh-search-screen__form, .dsh-search-screen__submit, .dsh-search-screen__source, .dsh-search-screen__title { transition: none; }
}
`

    /** Localized page copy keyed by UI failure code. */
    const LOCAL_MESSAGES = {
      'network-error': 'error.offline',
      'invalid-query': 'error.invalidQuery',
      'query-too-long': 'error.tooLong',
      'search-timeout': 'error.timeout',
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
     * @returns the local date, or undefined when it cannot parse.
     */
    function dateOf(publishedAt) {
      const date = new Date(publishedAt)
      return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString()
    }

    /**
     * The magnifier glyph shared by the sidebar entry, the hero, and the form.
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
     * Sidebar entry icon; the sidebar owns the button around it.
     * @param props - the sidebar's icon share.
     * @returns the glyph.
     */
    function PanelIcon(props) {
      return h(SearchGlyph, { size: props.size })
    }

    /**
     * The search page: hero search box, suggestion chips, answered sources, and
     * the loading, empty, and failure states.
     * @param props - the main-panel seat: `t` and the injected search operation.
     * @returns the page element.
     */
    function SearchPage(props) {
      const t = props.t
      const search = props.search
      const activeLocale = props.activeLocale
      const [draft, setDraft] = useState('')
      const [status, setStatus] = useState('idle')
      const [outcome, setOutcome] = useState(null)
      const [failure, setFailure] = useState(null)
      const [recent, setRecent] = useState([])
      const inputRef = useRef(null)
      const requestRef = useRef(null)

      const focusInput = useCallback(() => {
        inputRef.current?.focus()
      }, [])

      useEffect(() => {
        focusInput()
        return () => { requestRef.current?.abort() }
      }, [focusInput])

      const goHome = useCallback(() => {
        requestRef.current?.abort()
        requestRef.current = null
        setStatus('idle')
        setOutcome(null)
        setFailure(null)
        setDraft('')
        focusInput()
      }, [focusInput])

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
        setRecent(previous => [query, ...previous.filter(item => item !== query)].slice(0, RECENT_LIMIT))
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
      }, [focusInput, search])

      const onSubmit = useCallback((event) => {
        event.preventDefault()
        void runSearch(draft)
      }, [draft, runSearch])

      const onInputKeyDown = useCallback((event) => {
        if (event.key === 'Escape' && draft !== '') {
          event.preventDefault()
          setDraft('')
        }
      }, [draft])

      const runExample = useCallback((query) => {
        setDraft(query)
        void runSearch(query)
      }, [runSearch])

      const compact = status !== 'idle'
      const sources = outcome?.sources ?? []
      const language = typeof activeLocale === 'function' ? String(activeLocale()) : 'en'
      const examples = language.startsWith('zh') ? EXAMPLES.zh : EXAMPLES.en
      const title = compact
        ? h('span', {
          className: 'dsh-search-screen__title dsh-search-screen__title--compact',
        }, t('title'))
        : h('h1', { className: 'dsh-search-screen__title' }, t('title'))

      const brand = h(compact ? 'button' : 'div', {
        type: compact ? 'button' : undefined,
        className: compact
          ? 'dsh-search-screen__brand dsh-search-screen__brand--compact'
          : 'dsh-search-screen__brand',
        onClick: compact ? goHome : undefined,
        'aria-label': compact ? t('backHome') : undefined,
      },
      h('span', { className: 'dsh-search-screen__mark' }, h(SearchGlyph, { size: compact ? 20 : 30 })),
      h('span', { className: 'dsh-search-screen__brand-text' },
        title,
        compact ? null : h('p', { className: 'dsh-search-screen__subtitle' }, t('subtitle'))))

      const form = h('form', {
        className: 'dsh-search-screen__form', role: 'search', 'aria-label': t('formAria'), onSubmit,
      },
      h('span', { className: 'dsh-search-screen__search-icon' }, h(SearchGlyph, { size: 18 })),
      h('input', {
        ref: inputRef,
        className: 'dsh-search-screen__input',
        type: 'text',
        value: draft,
        placeholder: t('placeholder'),
        'aria-label': t('placeholder'),
        autoComplete: 'off',
        spellCheck: false,
        maxLength: MAX_QUERY_LENGTH,
        onChange: event => { setDraft(event.target.value) },
        onKeyDown: onInputKeyDown,
      }),
      h('button', {
        className: 'dsh-search-screen__submit',
        type: 'submit',
        disabled: status === 'loading' || draft.trim() === '',
      }, status === 'loading' ? t('searching') : t('search')))

      const suggestionGroups = compact ? null : h('div', { className: 'dsh-search-screen__suggestions' },
        h('div', { className: 'dsh-search-screen__chip-group' },
          h('p', { className: 'dsh-search-screen__chip-label' }, t('heroExamples')),
          examples.map(query => h('button', {
            key: `example:${query}`,
            className: 'dsh-search-screen__chip',
            type: 'button',
            onClick: () => { runExample(query) },
          }, query))),
        recent.length === 0 ? null : h('div', { className: 'dsh-search-screen__chip-group' },
          h('p', { className: 'dsh-search-screen__chip-label' }, t('heroRecent')),
          recent.map(query => h('button', {
            key: `recent:${query}`,
            className: 'dsh-search-screen__chip',
            type: 'button',
            onClick: () => { runExample(query) },
          }, query))))

      const statusText = status === 'loading'
        ? t('searching')
        : status === 'done'
          ? t('results.count', { count: sources.length })
          : status === 'error' ? t('error.title') : ''

      let results = null
      if (status === 'loading') {
        results = h('div', { className: 'dsh-search-screen__results' },
          h('div', {
            className: 'dsh-search-screen__skeleton-list', 'aria-hidden': 'true',
          }, Array.from({ length: 4 }, (_, index) => h('div', {
            key: index, className: 'dsh-search-screen__skeleton',
          }))))
      } else if (status === 'error') {
        results = h('div', { className: 'dsh-search-screen__results' },
          h('div', { className: 'dsh-search-screen__error', role: 'alert' },
            h('p', { className: 'dsh-search-screen__error-title' }, t('error.title')),
            h('p', { className: 'dsh-search-screen__error-message' }, messageFor(failure, t)),
            failure?.code === undefined ? null : h('p', {
              className: 'dsh-search-screen__error-code',
            }, failure.code),
            h('div', { className: 'dsh-search-screen__error-actions' },
              h('button', {
                className: 'dsh-search-screen__submit',
                type: 'button',
                onClick: () => { void runSearch(draft) },
              }, t('error.retry')))))
      } else if (status === 'done') {
        results = h('div', { className: 'dsh-search-screen__results' },
          outcome?.answer === undefined ? null : h('section', { className: 'dsh-search-screen__answer' },
            h('p', { className: 'dsh-search-screen__card-label' }, t('answer.label')),
            h('p', { className: 'dsh-search-screen__answer-text' }, outcome.answer)),
          sources.length === 0
            ? h('p', { className: 'dsh-search-screen__empty' }, t('results.empty'))
            : h('ol', { className: 'dsh-search-screen__sources' }, sources.map((source, index) => h('li', {
              key: `${source.url}#${String(index)}`,
              className: 'dsh-search-screen__source',
            },
            h('a', {
              className: 'dsh-search-screen__source-title',
              href: source.url,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, source.title !== undefined && source.title !== '' ? source.title : hostOf(source.url)),
            h('div', { className: 'dsh-search-screen__source-meta' }, [
              hostOf(source.url),
              source.publishedAt === undefined ? undefined : dateOf(source.publishedAt),
            ].filter(part => part !== undefined && part !== '').join(' · ')),
            source.snippet === undefined || source.snippet === ''
              ? null
              : h('p', { className: 'dsh-search-screen__source-snippet' }, source.snippet)))),
          h('p', { className: 'dsh-search-screen__foot' }, [
            t('foot', { max: outcome?.maxResults ?? sources.length }),
            outcome?.truncated === true ? t('results.truncated') : undefined,
          ].filter(part => part !== undefined).join(' · ')))
      }

      return h('div', {
        className: 'dsh-search-screen__page',
        'data-mode': compact ? 'compact' : 'hero',
      },
      h('style', { key: 'style' }, CSS),
      h('div', { className: 'dsh-search-screen__hero' },
        brand,
        form,
        suggestionGroups,
        h('div', { className: 'dsh-search-screen__sr', role: 'status', 'aria-live': 'polite' }, statusText)),
      results)
    }

    /**
     * Register the sidebar entry, the page, and this plugin's dictionaries.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'search-screen: zh dictionary')
      ctx.effect(() => ctx.locale.register(NS, 'en', en), 'search-screen: en dictionary')
      const t = ctx.locale.bind(NS)
      const face = {
        search: (query, signal) => requestSearch(query, signal),
        activeLocale: () => ctx.locale.getLocale().active,
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
