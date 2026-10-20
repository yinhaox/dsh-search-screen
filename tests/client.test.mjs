/**
 * Browser-half behavior for dsh-search-screen: the module entry the client
 * loader expects, the slot registrations `apply` contributes, the dictionaries
 * they translate through, and a server-render smoke of the page (which catches
 * a component that would crash its slot entry).
 *
 * React only serves this test; the plugin itself imports no package at runtime.
 */

import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/** Locale namespace the plugin owns. */
const NS = 'searchScreen'

/** Captured `window.__ModuleLoader__.load` payload. */
let loaded

/** The browser module table `require` this plugin may use: React only. */
const requireStub = (spec) => {
  if (spec === 'react') return React
  throw new Error(`unexpected require: ${spec}`)
}

before(async () => {
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        loaded = entry
      },
    },
  }
  await import('../client.js')
})

/**
 * Assemble the browser context `apply` receives, recording everything it
 * contributes.
 * @returns the fake context and its captured state.
 */
function createBrowserContext() {
  const dictionaries = { zh: {}, en: {} }
  let active = 'zh'
  const registrations = []
  const effects = []
  const ctx = {
    effect(callback, label) {
      const dispose = callback()
      effects.push({ label, dispose })
      return () => { dispose?.() }
    },
    locale: {
      register(namespace, locale, dictionary) {
        dictionaries[locale][namespace] = dictionary
        return () => {}
      },
      bind(namespace) {
        return (key, params) => {
          const dictionary = { ...dictionaries.en[namespace], ...dictionaries[active][namespace] }
          const template = dictionary[key] ?? key
          return params === undefined
            ? template
            : template.replace(/\{(\w+)\}/gu, (match, name) => name in params ? String(params[name]) : match)
        }
      },
      getLocale: () => ({ active }),
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
  return { ctx, registrations, dictionaries, effects, setActive: (locale) => { active = locale } }
}

test('registers a lazy factory under the package name', () => {
  assert.equal(loaded.id, '@yinhaox/dsh-search-screen')
  assert.equal(typeof loaded.factory, 'function')
  const plugin = loaded.factory(requireStub)
  assert.deepEqual(plugin.inject, ['slots', 'locale'])
  assert.equal(typeof plugin.apply, 'function')
})

test('contributes the sidebar entry and the matching main panel', () => {
  const { ctx, registrations, effects } = createBrowserContext()
  loaded.factory(requireStub).apply(ctx)

  const main = registrations.find(entry => entry.options.name === 'main')
  const panel = registrations.find(entry => entry.options.name === 'sidebar.panellist')
  assert.ok(main, 'main panel registration')
  assert.equal(main.options.key, 'search-screen')
  assert.equal(main.options.locale, NS)
  assert.equal(typeof main.component, 'function')
  assert.ok(panel, 'sidebar entry registration')
  assert.equal(panel.options.id, 'search-screen')
  assert.equal(panel.options.order, 5)
  assert.equal(typeof panel.options.label, 'function')
  assert.equal(typeof panel.component, 'function')
  // Both dictionaries are registered as effects owned by the plugin fiber.
  assert.equal(effects.length, 2)
})

test('registers complete zh and en dictionaries', () => {
  const { ctx, dictionaries } = createBrowserContext()
  loaded.factory(requireStub).apply(ctx)
  const zh = dictionaries.zh[NS]
  const en = dictionaries.en[NS]
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  assert.equal(zh['panel'], '搜索')
  assert.equal(en['panel'], 'Search')
})

test('the sidebar label follows the active locale', () => {
  const { ctx, registrations } = createBrowserContext()
  loaded.factory(requireStub).apply(ctx)
  const label = registrations.find(entry => entry.options.name === 'sidebar.panellist').options.label
  assert.equal(label(), '搜索')
})

test('renders the hero page as the panel content', () => {
  const { ctx, registrations, dictionaries } = createBrowserContext()
  loaded.factory(requireStub).apply(ctx)
  const page = registrations.find(entry => entry.options.name === 'main').component
  const dictionary = dictionaries.zh[NS]
  const t = (key, params) => {
    const template = dictionary[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/gu, (match, name) => name in params ? String(params[name]) : match)
  }
  const markup = renderToStaticMarkup(React.createElement(page, {
    t,
    search: async () => { throw new Error('the idle page must not search') },
    activeLocale: () => 'zh',
  }))

  assert.match(markup, /dsh-search-screen__page/)
  assert.match(markup, /data-mode="hero"/)
  assert.match(markup, /DeepSeek 搜索/)
  assert.match(markup, /输入搜索内容，按 Enter 搜索/)
  assert.match(markup, /试试这些/)
  assert.match(markup, /role="search"/)
  assert.match(markup, /DeepSeek Harness/)
  assert.match(markup, /role="status"/)
  assert.doesNotMatch(markup, /__dsh-entry-crashed|error\.unknown/u)
})

test('the stylesheet uses theme tokens and no literal colors', () => {
  const { ctx, registrations } = createBrowserContext()
  loaded.factory(requireStub).apply(ctx)
  const page = registrations.find(entry => entry.options.name === 'main').component
  const t = key => key
  const markup = renderToStaticMarkup(React.createElement(page, {
    t,
    search: async () => ({}),
    activeLocale: () => 'en',
  }))
  const css = /<style>(.*?)<\/style>/su.exec(markup)?.[1] ?? ''
  assert.ok(css.length > 0, 'stylesheet is rendered with the page')
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/u)
  assert.doesNotMatch(css, /\brgba?\(/u)
  assert.doesNotMatch(css, /\bhsla?\(/u)
  for (const match of css.matchAll(/var\((--[a-z0-9-]+)/gu)) {
    assert.match(match[1], /^--(?:dsw-|dsh-|ds-)/u)
  }
  assert.match(css, /--dsw-alias-bg-base/)
  assert.match(css, /prefers-reduced-motion/)
})
