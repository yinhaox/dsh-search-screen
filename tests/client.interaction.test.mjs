/**
 * Interaction behavior for dsh-search-screen's page in a DOM: typing,
 * submitting, the loading → results path, the failure card with retry, the empty
 * state, Escape/clear, the IME-composition Enter guard, and the recent-query
 * chips that outlive the panel.
 *
 * React and jsdom only serve this test; the plugin itself imports no package at
 * runtime.
 */

import assert from 'node:assert/strict'
import { after, test } from 'node:test'

// React DOM reads the DOM environment when it is first imported, so the jsdom
// globals are installed before those modules load.
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://127.0.0.1:3080/',
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
globalThis.HTMLElement = window.HTMLElement
globalThis.HTMLInputElement = window.HTMLInputElement
globalThis.Event = window.Event
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.CompositionEvent = window.CompositionEvent
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = await import('react')
const { createRoot } = await import('react-dom/client')
const testUtils = await import('react-dom/test-utils')
const act = React.act ?? testUtils.act

/** Locale namespace the plugin owns. */
const NS = 'searchScreen'

/** Captured `window.__ModuleLoader__.load` payload. */
let loaded

/** The browser module table `require` this plugin may use: React only. */
const requireStub = (spec) => {
  if (spec === 'react') return React
  throw new Error(`unexpected require: ${spec}`)
}

/** Result payload the page renders for a successful search. */
const RESULT = {
  ok: true,
  query: 'deepseek',
  maxResults: 8,
  tookMs: 640,
  answer: 'A short summary.',
  truncated: false,
  sources: [
    {
      url: 'https://example.com/a',
      title: 'Example result',
      snippet: 'A snippet about the answer.',
      publishedAt: '2026-01-02',
    },
  ],
}

window.__ModuleLoader__ = { load(entry) { loaded = entry } }
await import('../client.js')

after(() => {
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

/**
 * Assemble one page instance: apply the plugin to a fake browser context and
 * read back the component, its translate seat, and its inject face.
 * @returns the page component and the props the renderer would supply.
 */
function createPage() {
  const dictionaries = { zh: {}, en: {} }
  const registrations = []
  const ctx = {
    effect(callback) {
      const dispose = callback()
      return () => { dispose?.() }
    },
    locale: {
      register(namespace, locale, dictionary) {
        dictionaries[locale][namespace] = dictionary
        return () => {}
      },
      bind(namespace) {
        return (key, params) => {
          const dictionary = { ...dictionaries.en[namespace], ...dictionaries.zh[namespace] }
          const template = dictionary[key] ?? key
          return params === undefined
            ? template
            : template.replace(/\{(\w+)\}/gu, (match, name) => name in params ? String(params[name]) : match)
        }
      },
      getLocale: () => ({ active: 'zh' }),
    },
    slots: {
      inject(_owner, callback) {
        callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  loaded.factory(requireStub).apply(ctx)
  const registration = registrations.find(entry => entry.options.name === 'main')
  return {
    Page: registration.component,
    face: registration.options.inject(),
    t: ctx.locale.bind(NS),
  }
}

/**
 * Mount the page in a detached DOM container.
 * @param page - fixture from {@link createPage}.
 * @param overrides - props to replace on the inject face.
 * @returns the container and the React root.
 */
function mount(page, overrides = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(React.createElement(page.Page, {
      ...page.face,
      ...overrides,
      t: page.t,
      usePanelInfo: selector => selector({ activePanelId: 'search-screen' }),
    }))
  })
  return { container, root }
}

/** The visible tab panel; inactive tabs stay mounted but hidden. */
function activePanel(container) {
  return container.querySelector('.dsh-search-screen__tabpanel:not([hidden])')
}

/** Replace the input's value the way a user typing does. */
function type(container, value) {
  const input = activePanel(container).querySelector('input')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  return input
}

/** Submit the visible tab's search form. */
function submit(container) {
  const form = activePanel(container).querySelector('form')
  act(() => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  })
}

/** Flush the search promise and React's re-render. */
async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** Read the visible tab page's mode. */
function modeOf(container) {
  return activePanel(container).querySelector('.dsh-search-screen__page').getAttribute('data-mode')
}

test('typing and submitting renders the answer and sources', async () => {
  const page = createPage()
  const calls = []
  const { container } = mount(page, {
    search: async (query) => {
      calls.push(query)
      return RESULT
    },
  })

  type(container, 'deepseek')
  submit(container)
  await flush()

  assert.deepEqual(calls, ['deepseek'])
  assert.equal(modeOf(container), 'results')
  const text = container.textContent
  assert.match(text, /Example result/u)
  assert.match(text, /example\.com/u)
  assert.match(text, /A snippet about the answer\./u)
  assert.match(text, /1 条结果/u)
  assert.match(text, /0\.6 秒/u)
  assert.match(text, /DeepSeek 摘要/u)
  assert.match(text, /A short summary\./u)
  assert.match(text, /最多 8 条/u)
  assert.equal(container.querySelector('.dsh-search-screen__avatar').textContent, 'e')
  // The field keeps focus across the hero -> results switch, so the next query
  // can be typed without clicking back into it.
  assert.equal(document.activeElement, container.querySelector('input'))
  const title = container.querySelector('button.dsh-search-screen__sourceTitle')
  assert.ok(title, 'the result title opens the reader')
  const external = container.querySelector('.dsh-search-screen__sourceOpen')
  assert.equal(external.getAttribute('href'), 'https://example.com/a')
  assert.equal(external.getAttribute('target'), '_blank')
  assert.match(external.getAttribute('rel'), /noreferrer/u)
})

test('shows skeletons while the search is in flight', async () => {
  const page = createPage()
  let resolveSearch
  const { container } = mount(page, {
    search: () => new Promise((resolve) => { resolveSearch = resolve }),
  })

  type(container, 'deepseek')
  submit(container)
  await flush()

  assert.equal(container.querySelectorAll('.dsh-search-screen__skeletonItem').length, 4)
  const submitButton = container.querySelector('.dsh-search-screen__submit')
  assert.equal(submitButton.disabled, true)
  assert.match(container.textContent, /搜索中…/u)

  await act(async () => {
    resolveSearch(RESULT)
    await Promise.resolve()
  })
  await flush()
  assert.equal(container.querySelectorAll('.dsh-search-screen__skeletonItem').length, 0)
  assert.match(container.textContent, /Example result/u)
})

test('renders the failure card and retries through it', async () => {
  const page = createPage()
  let attempts = 0
  const { container } = mount(page, {
    search: async () => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('no usable provider')
        error.code = 'WEB_PROVIDER_UNAVAILABLE'
        throw error
      }
      return RESULT
    },
  })

  type(container, 'deepseek')
  submit(container)
  await flush()

  const text = container.textContent
  assert.match(text, /搜索失败/u)
  assert.match(text, /no usable provider/u)
  assert.match(text, /WEB_PROVIDER_UNAVAILABLE/u)

  const retry = container.querySelector('.dsh-search-screen__errorActions button')
  act(() => { retry.click() })
  await flush()
  assert.equal(attempts, 2)
  assert.match(container.textContent, /Example result/u)
})

test('renders the empty state for a search without sources', async () => {
  const page = createPage()
  const { container } = mount(page, {
    search: async () => ({ ...RESULT, sources: [], answer: undefined }),
  })

  type(container, 'deepseek')
  submit(container)
  await flush()

  assert.equal(modeOf(container), 'results')
  assert.match(container.textContent, /没有找到相关结果/u)
  assert.match(container.textContent, /试试更简短或不同的关键词/u)
})

test('Escape clears the query, then returns to the hero page', async () => {
  const page = createPage()
  const { container } = mount(page, { search: async () => RESULT })

  const input = type(container, 'deepseek')
  submit(container)
  await flush()
  assert.equal(modeOf(container), 'results')

  act(() => {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.equal(input.value, '')
  assert.equal(modeOf(container), 'results')

  act(() => {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.equal(modeOf(container), 'hero')
})

test('the clear button empties the query without leaving the results', async () => {
  const page = createPage()
  const { container } = mount(page, { search: async () => RESULT })

  type(container, 'deepseek')
  submit(container)
  await flush()

  const clear = container.querySelector('.dsh-search-screen__clear')
  assert.ok(clear, 'the clear control appears once the field has text')
  act(() => { clear.click() })
  assert.equal(container.querySelector('input').value, '')
  assert.equal(modeOf(container), 'results')
  assert.equal(container.querySelector('.dsh-search-screen__clear'), null)
})

test('Enter during an IME composition does not submit the query', async () => {
  const page = createPage()
  const calls = []
  const { container } = mount(page, {
    search: async (query) => {
      calls.push(query)
      return RESULT
    },
  })

  const input = type(container, '中')
  act(() => {
    input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }))
  })
  act(() => {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  await flush()
  assert.deepEqual(calls, [])
  assert.equal(modeOf(container), 'hero')

  act(() => {
    input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }))
  })
  act(() => {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  await flush()
  assert.deepEqual(calls, ['中'])
})

test('a submitted query stays in the recent chips after leaving the panel', async () => {
  const page = createPage()
  const { container } = mount(page, { search: async () => RESULT })

  type(container, 'deepseek')
  submit(container)
  await flush()

  const brandChip = container.querySelector('button.dsh-search-screen__brand')
  assert.ok(brandChip, 'the results toolbar offers the way home')
  act(() => { brandChip.click() })

  assert.equal(modeOf(container), 'hero')
  const chipTexts = [...container.querySelectorAll('.dsh-search-screen__chip')].map(chip => chip.textContent)
  assert.ok(chipTexts.includes('deepseek'), `recent chip missing from ${JSON.stringify(chipTexts)}`)

  // A fresh panel instance reads the same remembered queries.
  const remounted = mount(page)
  const remountedChips = [...remounted.container.querySelectorAll('.dsh-search-screen__chip')]
    .map(chip => chip.textContent)
  assert.ok(remountedChips.includes('deepseek'))
})

test('reads a source in the page and returns to the results', async () => {
  const page = createPage()
  const requested = []
  const { container } = mount(page, {
    search: async () => RESULT,
    read: async (url) => {
      requested.push(url)
      return {
        ok: true,
        url,
        title: 'Reader title',
        description: 'A lead paragraph.',
        chars: 1200,
        tookMs: 90,
        truncated: false,
        blocks: [
          { kind: 'paragraph', text: 'First paragraph.' },
          { kind: 'heading', level: 2, text: 'A section' },
          { kind: 'listItem', text: 'one' },
          { kind: 'listItem', text: 'two' },
          { kind: 'quote', text: 'A quote.' },
          { kind: 'code', text: 'const x = 1' },
        ],
      }
    },
  })

  type(container, 'deepseek')
  submit(container)
  await flush()

  act(() => { container.querySelector('button.dsh-search-screen__sourceTitle').click() })
  await flush()

  assert.deepEqual(requested, ['https://example.com/a'])
  assert.equal(modeOf(container), 'reader')
  const text = container.textContent
  assert.match(text, /Reader title/u)
  assert.match(text, /A lead paragraph\./u)
  assert.match(text, /First paragraph\./u)
  assert.match(text, /A section/u)
  assert.match(text, /1,200 字/u)
  assert.ok(container.querySelector('.dsh-search-screen__article ul li'), 'list items share a list')
  assert.ok(container.querySelector('blockquote'))
  assert.ok(container.querySelector('pre code'))
  assert.equal(document.activeElement, container.querySelector('.dsh-search-screen__readerBack'))

  act(() => { container.querySelector('.dsh-search-screen__readerBack').click() })
  await flush()
  assert.equal(modeOf(container), 'results')
  assert.match(container.textContent, /Example result/u)
  assert.equal(document.activeElement, container.querySelector('input'))
})

test('the reader opens at the top and back restores the results position', async () => {
  const page = createPage()
  const { container } = mount(page, {
    search: async () => RESULT,
    read: async (url) => ({ ok: true, url, blocks: [{ kind: 'paragraph', text: 'Body.' }] }),
  })

  type(container, 'deepseek')
  submit(container)
  await flush()

  const root = container.querySelector('.dsh-search-screen__page')
  act(() => { root.scrollTop = 420 })
  act(() => { container.querySelector('button.dsh-search-screen__sourceTitle').click() })
  await flush()
  assert.equal(root.scrollTop, 0, 'the article starts at its own top')

  act(() => { root.scrollTop = 900 })
  act(() => { container.querySelector('.dsh-search-screen__readerBack').click() })
  await flush()
  assert.equal(root.scrollTop, 420, 'the results list returns to where it was')
})

test('shows a reader failure and retries that page', async () => {
  const page = createPage()
  let attempts = 0
  const { container } = mount(page, {
    search: async () => RESULT,
    read: async (url) => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('blocked')
        error.code = 'fetch-failed'
        throw error
      }
      return { ok: true, url, chars: 9, blocks: [{ kind: 'paragraph', text: 'Body text.' }] }
    },
  })

  type(container, 'deepseek')
  submit(container)
  await flush()
  act(() => { container.querySelector('button.dsh-search-screen__sourceTitle').click() })
  await flush()

  assert.equal(modeOf(container), 'reader')
  assert.match(container.textContent, /无法读取该网页/u)
  assert.match(container.textContent, /网页无法访问/u)
  assert.match(container.textContent, /fetch-failed/u)

  const retry = container.querySelector('.dsh-search-screen__errorActions button')
  act(() => { retry.click() })
  await flush()
  assert.equal(attempts, 2)
  assert.match(container.textContent, /Body text\./u)
})

test('Escape in the reader returns to the results', async () => {
  const page = createPage()
  const { container } = mount(page, {
    search: async () => RESULT,
    read: async (url) => ({ ok: true, url, blocks: [{ kind: 'paragraph', text: 'Body.' }] }),
  })

  type(container, 'deepseek')
  submit(container)
  await flush()
  act(() => { container.querySelector('button.dsh-search-screen__sourceTitle').click() })
  await flush()
  assert.equal(modeOf(container), 'reader')

  act(() => {
    container.querySelector('.dsh-search-screen__readerBack').dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
  })
  await flush()
  assert.equal(modeOf(container), 'results')
})

test('a pasted page address opens the reader instead of searching', async () => {
  const page = createPage()
  const searched = []
  const requested = []
  const { container } = mount(page, {
    search: async (query) => {
      searched.push(query)
      return RESULT
    },
    read: async (url) => {
      requested.push(url)
      return {
        ok: true,
        url,
        title: 'DeepSeek 官网',
        chars: 321,
        blocks: [{ kind: 'paragraph', text: 'DeepSeek 是一家 AI 公司。' }],
      }
    },
  })

  type(container, 'https://www.deepseek.com/')
  // The field acts as an address bar: the button offers to read, not to search.
  assert.equal(container.querySelector('.dsh-search-screen__submit').textContent, '阅读')
  submit(container)
  await flush()

  assert.deepEqual(searched, [], 'an address never reaches the search route')
  assert.deepEqual(requested, ['https://www.deepseek.com/'])
  assert.equal(modeOf(container), 'reader')
  assert.match(container.textContent, /DeepSeek 官网/u)
  assert.match(container.textContent, /DeepSeek 是一家 AI 公司。/u)
  assert.equal(container.querySelector('.dsh-search-screen__readerSite').textContent, 'www.deepseek.com')
  assert.equal(container.querySelector('.dsh-search-screen__readerBack').textContent, '返回首页')

  act(() => { container.querySelector('.dsh-search-screen__readerBack').click() })
  await flush()
  assert.equal(modeOf(container), 'hero')
  assert.equal(document.activeElement, container.querySelector('input'))
  // A navigated address is not a search, so no recent chip remembers it.
  const chips = [...container.querySelectorAll('.dsh-search-screen__chip')].map(chip => chip.textContent)
  assert.ok(!chips.includes('https://www.deepseek.com/'), `unexpected chip in ${JSON.stringify(chips)}`)
})

test('typing an address from the results returns to those results', async () => {
  const page = createPage()
  const requested = []
  const { container } = mount(page, {
    search: async () => RESULT,
    read: async (url) => {
      requested.push(url)
      return { ok: true, url, blocks: [{ kind: 'paragraph', text: 'Body.' }] }
    },
  })

  type(container, 'deepseek')
  submit(container)
  await flush()

  type(container, 'https://www.deepseek.com/')
  submit(container)
  await flush()
  assert.deepEqual(requested, ['https://www.deepseek.com/'])
  assert.equal(modeOf(container), 'reader')
  // The results list is still behind the reader, so the reader returns to it.
  assert.equal(container.querySelector('.dsh-search-screen__readerBack').textContent, '返回结果')

  act(() => { container.querySelector('.dsh-search-screen__readerBack').click() })
  await flush()
  assert.equal(modeOf(container), 'results')
  assert.match(container.textContent, /Example result/u)
})

test('only explicit http(s) addresses become navigation', async () => {
  const page = createPage()
  const searched = []
  const requested = []
  const { container } = mount(page, {
    search: async (query) => {
      searched.push(query)
      return RESULT
    },
    read: async (url) => {
      requested.push(url)
      return { ok: true, url, blocks: [] }
    },
  })

  for (const text of ['example.com', 'ftp://example.com/file', 'http://localhost:3080/', 'deepseek 官网']) {
    type(container, text)
    submit(container)
    await flush()
  }

  assert.deepEqual(searched, ['example.com', 'ftp://example.com/file', 'http://localhost:3080/', 'deepseek 官网'])
  assert.deepEqual(requested, [])
})

test('each page and query keeps its own tab', async () => {
  const page = createPage()
  const requested = []
  const { container } = mount(page, {
    search: async () => RESULT,
    read: async (url) => {
      requested.push(url)
      return {
        ok: true,
        url,
        title: 'DeepSeek 官网',
        blocks: [{ kind: 'paragraph', text: '官网正文。' }],
      }
    },
  })

  type(container, 'https://www.deepseek.com/')
  submit(container)
  await flush()
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 1)
  assert.equal(container.querySelector('.dsh-search-screen__tabText').textContent, 'DeepSeek 官网')

  act(() => { container.querySelector('.dsh-search-screen__tabNew').click() })
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 2)
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel:not([hidden])').length, 1)
  assert.equal(modeOf(container), 'hero', 'a new tab starts on the search home')
  assert.equal(document.activeElement, activePanel(container).querySelector('input'))
  assert.equal([...container.querySelectorAll('.dsh-search-screen__tabText')][1].textContent, '新标签页')

  type(container, 'deepseek')
  submit(container)
  await flush()
  assert.equal(modeOf(container), 'results')
  assert.match(activePanel(container).textContent, /Example result/u)
  const labels = [...container.querySelectorAll('.dsh-search-screen__tabText')].map(node => node.textContent)
  assert.deepEqual(labels, ['DeepSeek 官网', 'deepseek'])

  // The page in the first tab survived the visit to the second one.
  act(() => { container.querySelectorAll('.dsh-search-screen__tabLabel')[0].click() })
  assert.equal(modeOf(container), 'reader')
  assert.match(activePanel(container).textContent, /官网正文。/u)
  assert.deepEqual(requested, ['https://www.deepseek.com/'])
})

test('closing a tab activates its neighbor and the last tab stays', async () => {
  const page = createPage()
  const { container } = mount(page, { search: async () => RESULT })

  act(() => { container.querySelector('.dsh-search-screen__tabNew').click() })
  act(() => { container.querySelector('.dsh-search-screen__tabNew').click() })
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 3)

  // Closing the active tab lands on the tab that took its place.
  act(() => { [...container.querySelectorAll('.dsh-search-screen__tabClose')][2].click() })
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 2)
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel:not([hidden])').length, 1)
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel:not([hidden])')[0].isConnected, true)

  act(() => { [...container.querySelectorAll('.dsh-search-screen__tabClose')][1].click() })
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 1)
  assert.equal(container.querySelector('.dsh-search-screen__tabClose').disabled, true)
})

test('double-clicking empty strip space opens a tab', async () => {
  const page = createPage()
  const { container } = mount(page, { search: async () => RESULT })
  const strip = container.querySelector('.dsh-search-screen__tabstrip')

  act(() => { strip.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })) })
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 2)

  // Double-clicking a tab itself must not open another one.
  act(() => {
    container.querySelector('.dsh-search-screen__tabLabel').dispatchEvent(
      new window.MouseEvent('dblclick', { bubbles: true }),
    )
  })
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 2)

  // The new-tab button owns its own clicks; the strip must not add a third.
  act(() => {
    container.querySelector('.dsh-search-screen__tabNew').dispatchEvent(
      new window.MouseEvent('dblclick', { bubbles: true }),
    )
  })
  assert.equal(container.querySelectorAll('.dsh-search-screen__tabpanel').length, 2)
})