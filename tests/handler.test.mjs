/**
 * Route behavior for dsh-search-screen: query validation, the seam call, JSON
 * projection, error mapping, timeout, trust fence, and method handling.
 * Runs with `node --test` and needs no Harness process.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSearchHandler, MAX_QUERY_LENGTH, SEARCH_ROUTE_PATH,
} from '../handler.js'

/** Minimal ServerResponse stand-in capturing status, headers, and body. */
function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
}

/** Minimal IncomingMessage stand-in for a GET with a query string. */
function fakeRequest(query, { method = 'GET', headers = {} } = {}) {
  const url = query === undefined ? SEARCH_ROUTE_PATH : `${SEARCH_ROUTE_PATH}?q=${encodeURIComponent(query)}`
  return { method, url, headers }
}

/** Drive one handler call and return the response. */
async function call(handler, request) {
  const response = fakeResponse()
  await handler(request, response)
  return response
}

/** Parse the response's JSON body. */
function bodyOf(response) {
  return JSON.parse(String(response.body))
}

test('runs the query through the seam and projects the sources', async () => {
  const calls = []
  const handler = createSearchHandler({
    maxResults: 3,
    timeoutMs: 1000,
    search: async (request, signal) => {
      calls.push({ request, aborted: signal.aborted })
      return {
        content: 'A short answer.',
        truncated: true,
        sources: [
          { url: 'https://example.com/a', title: 'A', snippet: 'a snippet', publishedAt: '2026-01-02' },
          { url: 'https://example.com/b', extra: 'dropped' },
        ],
      }
    },
  })

  const response = await call(handler, fakeRequest('  deepseek  '))

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(calls[0].request, { query: 'deepseek', maxResults: 3 })
  assert.equal(calls[0].aborted, false)
  assert.deepEqual(bodyOf(response), {
    ok: true,
    query: 'deepseek',
    maxResults: 3,
    answer: 'A short answer.',
    truncated: true,
    sources: [
      { url: 'https://example.com/a', title: 'A', snippet: 'a snippet', publishedAt: '2026-01-02' },
      { url: 'https://example.com/b' },
    ],
  })
})

test('omits the answer when the provider returned none', async () => {
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 1000,
    search: async () => ({ sources: [], truncated: false }),
  })
  const body = bodyOf(await call(handler, fakeRequest('anything')))
  assert.equal(body.ok, true)
  assert.equal('answer' in body, false)
  assert.deepEqual(body.sources, [])
})

test('refuses a missing or blank query without calling the seam', async () => {
  let called = false
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 1000,
    search: async () => {
      called = true
      return { sources: [], truncated: false }
    },
  })

  for (const request of [fakeRequest(undefined), fakeRequest('   ')]) {
    const response = await call(handler, request)
    assert.equal(response.statusCode, 400)
    assert.equal(bodyOf(response).error.code, 'invalid-query')
  }
  assert.equal(called, false)
})

test('refuses an overlong query', async () => {
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 1000,
    search: async () => assert.fail('the seam must not run'),
  })
  const response = await call(handler, fakeRequest('x'.repeat(MAX_QUERY_LENGTH + 1)))
  assert.equal(response.statusCode, 400)
  assert.equal(bodyOf(response).error.code, 'query-too-long')
})

test('refuses methods other than GET', async () => {
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 1000,
    search: async () => assert.fail('the seam must not run'),
  })
  const response = await call(handler, fakeRequest('q', { method: 'POST' }))
  assert.equal(response.statusCode, 405)
  assert.equal(response.headers.allow, 'GET')
})

test('applies the trust fence before doing any work', async () => {
  let called = false
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 1000,
    rejection: () => 401,
    search: async () => {
      called = true
      return { sources: [], truncated: false }
    },
  })
  const response = await call(handler, fakeRequest('q'))
  assert.equal(response.statusCode, 401)
  assert.equal(called, false)
  assert.equal(response.body, undefined)
})

test('maps a seam failure with a code to a JSON failure', async () => {
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 1000,
    search: async () => {
      const error = new Error('no provider is usable')
      error.code = 'WEB_PROVIDER_UNAVAILABLE'
      throw error
    },
  })
  const response = await call(handler, fakeRequest('q'))
  assert.equal(response.statusCode, 200)
  assert.deepEqual(bodyOf(response), {
    ok: false,
    error: { code: 'WEB_PROVIDER_UNAVAILABLE', message: 'no provider is usable' },
  })
})

test('reports an unknown internal failure as a server error', async () => {
  const reported = []
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 1000,
    report: error => reported.push(error),
    search: async () => {
      throw new Error('boom')
    },
  })
  const response = await call(handler, fakeRequest('q'))
  assert.equal(response.statusCode, 500)
  assert.equal(bodyOf(response).error.code, 'search-failed')
  assert.equal(reported.length, 1)
})

test('bounds a slow search with the configured deadline', async () => {
  const handler = createSearchHandler({
    maxResults: 5,
    timeoutMs: 20,
    search: (request, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }),
  })
  const response = await call(handler, fakeRequest('q'))
  assert.equal(response.statusCode, 200)
  const body = bodyOf(response)
  assert.equal(body.ok, false)
  assert.equal(body.error.code, 'search-timeout')
})
