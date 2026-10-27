/**
 * Host half registration for dsh-search-screen: the two exact routes `apply`
 * contributes, their config bounds, and the browser-connection fence. Runs with
 * `node --test` and needs no Harness process.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, inject, name } from '../index.js'
import { SEARCH_ROUTE_PATH } from '../handler.js'
import { PAGE_ROUTE_PATH } from '../page.js'

/** Minimal ServerResponse stand-in for the route handlers. */
function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
}

/**
 * Assemble one Host context and record what `apply` registers.
 * @param options - optional browser connection stand-in.
 * @returns the context and its captured state.
 */
function createHost({ connection } = {}) {
  const routes = []
  const effects = []
  const searches = []
  const warnings = []
  const ctx = {
    get(key) {
      if (key === 'connection') return connection
      if (key === 'logger') return { warn: error => warnings.push(error) }
      return undefined
    },
    effect(callback, label) {
      const dispose = callback()
      effects.push({ label, dispose })
      return () => { dispose?.() }
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    web: {
      search: async (request, signal) => {
        searches.push({ request, signal })
        return { content: 'An answer.', truncated: false, sources: [{ url: 'https://example.com/a', title: 'A' }] }
      },
    },
  }
  return { ctx, routes, effects, searches, warnings }
}

/** Run one registered route with a fake request. */
async function call(route, url, method = 'GET') {
  const response = fakeResponse()
  await route.handler({ method, url, headers: {} }, response)
  return response
}

test('exposes the plugin name and its required services', () => {
  assert.equal(name, 'search-screen')
  assert.deepEqual(inject, ['webServer', 'web'])
})

test('registers one exact route per surface', () => {
  const { ctx, routes, effects } = createHost()
  apply(ctx, undefined)

  assert.deepEqual(routes.map(route => ({ kind: route.kind, path: route.path })), [
    { kind: 'exact', path: SEARCH_ROUTE_PATH },
    { kind: 'exact', path: PAGE_ROUTE_PATH },
  ])
  assert.deepEqual(effects.map(effect => effect.label), [
    `search-screen: GET ${SEARCH_ROUTE_PATH}`,
    `search-screen: GET ${PAGE_ROUTE_PATH}`,
  ])
  assert.equal(routes.every(route => typeof route.handler === 'function'), true)
})

test('the search route follows the config bounds', async () => {
  const defaults = createHost()
  apply(defaults.ctx, undefined)
  const defaultResponse = await call(defaults.routes[0], `${SEARCH_ROUTE_PATH}?q=deepseek`)
  assert.equal(JSON.parse(defaultResponse.body).maxResults, 8)
  assert.deepEqual(defaults.searches[0].request, { query: 'deepseek', maxResults: 8 })

  const configured = createHost()
  apply(configured.ctx, { maxResults: 3, timeoutMs: 5000, pageTimeoutMs: 6000 })
  const configuredResponse = await call(configured.routes[0], `${SEARCH_ROUTE_PATH}?q=deepseek`)
  assert.equal(JSON.parse(configuredResponse.body).maxResults, 3)
})

test('refuses an out-of-range config field', () => {
  for (const config of [
    { maxResults: 0 },
    { maxResults: 21 },
    { timeoutMs: 999 },
    { timeoutMs: 120_001 },
    { pageTimeoutMs: 0 },
    { pageTimeoutMs: 120_001 },
    { maxResults: 1.5 },
  ]) {
    assert.throws(() => apply(createHost().ctx, config), /search-screen: config/u)
  }
})

test('the browser connection fences both routes', async () => {
  const { ctx, routes } = createHost({ connection: { requestRejection: () => 401 } })
  apply(ctx, undefined)

  for (const route of routes) {
    const response = await call(route, `${route.path}?q=deepseek&url=https%3A%2F%2Fexample.com%2F`)
    assert.equal(response.statusCode, 401)
    assert.equal(response.body, undefined)
  }
})

test('the reader route validates its target before fetching', async () => {
  const { ctx, routes } = createHost()
  apply(ctx, undefined)
  const pageRoute = routes.find(route => route.path === PAGE_ROUTE_PATH)
  assert.ok(pageRoute, 'the reader route is registered')

  const refused = await call(pageRoute, `${PAGE_ROUTE_PATH}?url=${encodeURIComponent('http://127.0.0.1:3080/')}`)
  assert.equal(refused.statusCode, 400)
  assert.equal(JSON.parse(refused.body).error.code, 'private-host')

  const missing = await call(pageRoute, PAGE_ROUTE_PATH)
  assert.equal(missing.statusCode, 400)
  assert.equal(JSON.parse(missing.body).error.code, 'invalid-url')
})