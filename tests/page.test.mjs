/**
 * Reader route and loader behavior for dsh-search-screen: target validation,
 * the private-address fence, fetch bounds, extraction hand-off, JSON projection,
 * error mapping, timeout, and the trust fence. Runs with `node --test` and needs
 * no Harness process.
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import {
  createPageHandler, createPageLoader, isPrivateHostname, PAGE_ROUTE_PATH,
} from '../page.js'

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

/**
 * Build one request for the reader route.
 * @param target - the `url` parameter, or undefined to omit it.
 * @param options - method override.
 * @returns the fake IncomingMessage.
 */
function fakeRequest(target, { method = 'GET' } = {}) {
  const query = target === undefined ? '' : `?url=${encodeURIComponent(target)}`
  return { method, url: `${PAGE_ROUTE_PATH}${query}`, headers: {} }
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

/** One fetched HTML page as the loader would return it. */
const LOADED = {
  kind: 'html',
  url: 'https://example.com/article',
  text: '<html lang="en"><head><title>Read me</title></head><body><article><h1>Read me</h1><p>Body text.</p></article></body></html>',
}

test('reads one page and projects the extracted article', async () => {
  const calls = []
  const handler = createPageHandler({
    timeoutMs: 1000,
    load: async (url, signal) => {
      calls.push({ url, aborted: signal.aborted })
      return LOADED
    },
  })

  const response = await call(handler, fakeRequest('https://example.com/article'))

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(calls, [{ url: 'https://example.com/article', aborted: false }])
  const body = bodyOf(response)
  assert.equal(typeof body.tookMs, 'number')
  const { tookMs: _tookMs, ...rest } = body
  assert.deepEqual(rest, {
    ok: true,
    url: 'https://example.com/article',
    title: 'Read me',
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 1, text: 'Read me' },
      { kind: 'paragraph', text: 'Body text.' },
    ],
    chars: 17,
    truncated: false,
  })
})

test('reads a plain-text page as paragraphs', async () => {
  const handler = createPageHandler({
    timeoutMs: 1000,
    load: async () => ({ kind: 'text', url: 'https://example.com/notes.txt', text: 'one.\n\ntwo.' }),
  })
  const response = await call(handler, fakeRequest('https://example.com/notes.txt'))
  const { tookMs: _tookMs, ...rest } = bodyOf(response)
  assert.deepEqual(rest, {
    ok: true,
    url: 'https://example.com/notes.txt',
    blocks: [{ kind: 'paragraph', text: 'one.' }, { kind: 'paragraph', text: 'two.' }],
    chars: 8,
    truncated: false,
  })
})

test('refuses a missing, malformed, credentialed, or overlong target', async () => {
  const handler = createPageHandler({
    timeoutMs: 1000,
    load: async () => assert.fail('the loader must not run'),
  })
  const cases = [
    undefined,
    '   ',
    'not-a-url',
    'https://user:pass@example.com/',
    `https://example.com/${'x'.repeat(4096)}`,
  ]
  for (const target of cases) {
    const response = await call(handler, fakeRequest(target))
    assert.equal(response.statusCode, 400, String(target))
    assert.equal(bodyOf(response).error.code, 'invalid-url', String(target))
  }
})

test('refuses non-web protocols before fetching', async () => {
  const handler = createPageHandler({
    timeoutMs: 1000,
    load: async () => assert.fail('the loader must not run'),
  })
  for (const target of ['file:///etc/passwd', 'data:text/html,<p>x</p>', 'ftp://example.com/a']) {
    const response = await call(handler, fakeRequest(target))
    assert.equal(response.statusCode, 400, target)
    assert.equal(bodyOf(response).error.code, 'unsupported-protocol', target)
  }
})

test('refuses local and private targets before fetching', async () => {
  const handler = createPageHandler({
    timeoutMs: 1000,
    load: async () => assert.fail('the loader must not run'),
  })
  for (const target of [
    'http://localhost/',
    'http://app.localhost/',
    'http://127.0.0.1:3080/',
    'http://10.1.2.3/',
    'http://192.168.1.1/',
    'http://[::1]/',
    'http://printer.internal/',
  ]) {
    const response = await call(handler, fakeRequest(target))
    assert.equal(response.statusCode, 400, target)
    assert.equal(bodyOf(response).error.code, 'private-host', target)
  }
  // The judgement covers literal addresses and reserved names only.
  for (const host of ['localhost', '127.0.0.1', '[::1]', '10.0.0.5', '[::ffff:7f00:1]', '10.0.0.255']) {
    assert.equal(isPrivateHostname(host), true, host)
  }
  for (const host of ['example.com', '8.8.8.8', '[2001:4860:4860::8888]']) {
    assert.equal(isPrivateHostname(host), false, host)
  }
})

test('refuses methods other than GET', async () => {
  const handler = createPageHandler({
    timeoutMs: 1000,
    load: async () => assert.fail('the loader must not run'),
  })
  const response = await call(handler, fakeRequest('https://example.com/', { method: 'POST' }))
  assert.equal(response.statusCode, 405)
  assert.equal(response.headers.allow, 'GET')
})

test('applies the trust fence before doing any work', async () => {
  let called = false
  const handler = createPageHandler({
    timeoutMs: 1000,
    rejection: () => 401,
    load: async () => {
      called = true
      return LOADED
    },
  })
  const response = await call(handler, fakeRequest('https://example.com/article'))
  assert.equal(response.statusCode, 401)
  assert.equal(called, false)
  assert.equal(response.body, undefined)
})

test('maps a coded loader failure to a JSON failure', async () => {
  const handler = createPageHandler({
    timeoutMs: 1000,
    load: async () => {
      const error = new Error('the site refused the request')
      error.code = 'fetch-failed'
      throw error
    },
  })
  const response = await call(handler, fakeRequest('https://example.com/article'))
  assert.equal(response.statusCode, 200)
  assert.deepEqual(bodyOf(response), {
    ok: false,
    error: { code: 'fetch-failed', message: 'the site refused the request' },
  })
})

test('reports an unknown internal failure as a server error', async () => {
  const reported = []
  const handler = createPageHandler({
    timeoutMs: 1000,
    report: error => reported.push(error),
    load: async () => {
      throw new Error('boom')
    },
  })
  const response = await call(handler, fakeRequest('https://example.com/article'))
  assert.equal(response.statusCode, 500)
  assert.equal(bodyOf(response).error.code, 'page-failed')
  assert.equal(reported.length, 1)
})

test('bounds a slow page read with the configured deadline', async () => {
  const handler = createPageHandler({
    timeoutMs: 20,
    load: (_url, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }),
  })
  const response = await call(handler, fakeRequest('https://example.com/article'))
  const body = bodyOf(response)
  assert.equal(response.statusCode, 200)
  assert.equal(body.ok, false)
  assert.equal(body.error.code, 'page-timeout')
})

/**
 * Serve one request handler on a loopback port, then close it with the
 * connection it kept alive.
 * @param respond - the request listener.
 * @param run - receives the origin.
 * @returns whatever `run` returned.
 */
async function withServer(respond, run) {
  const server = createServer(respond)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    return await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.closeAllConnections?.()
    await new Promise(resolve => server.close(resolve))
  }
}

test('follows redirects and reports the final address', async () => {
  await withServer((req, res) => {
    res.on('error', () => {})
    if (req.url === '/start') {
      res.statusCode = 302
      res.setHeader('location', '/final')
      res.end()
      return
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<html><body><p>Final page.</p></body></html>')
  }, async (origin) => {
    const loaded = await createPageLoader()(`${origin}/start`)
    assert.equal(loaded.url, `${origin}/final`)
    assert.equal(loaded.kind, 'html')
    assert.match(loaded.text, /Final page\./u)
  })
})

test('stops a redirect chain at the configured limit', async () => {
  await withServer((_req, res) => {
    res.on('error', () => {})
    res.statusCode = 302
    res.setHeader('location', '/again')
    res.end()
  }, async (origin) => {
    await assert.rejects(
      () => createPageLoader({ maxRedirects: 2 })(`${origin}/again`),
      error => error.code === 'fetch-failed' && /too many times/u.test(error.message),
    )
  })
})

test('refuses a redirect to a local or private address', async () => {
  await withServer((_req, res) => {
    res.on('error', () => {})
    res.statusCode = 302
    res.setHeader('location', 'http://localhost:9/')
    res.end()
  }, async (origin) => {
    await assert.rejects(
      () => createPageLoader()(`${origin}/start`),
      error => error.code === 'private-host',
    )
  })
})

test('caps a body that exceeds the byte budget', async () => {
  await withServer((_req, res) => {
    res.on('error', () => {})
    res.setHeader('content-type', 'text/html')
    res.end('<p>' + 'x'.repeat(10_000) + '</p>')
  }, async (origin) => {
    await assert.rejects(
      () => createPageLoader({ maxBytes: 100 })(`${origin}/big`),
      error => error.code === 'page-too-large',
    )
  })
})

test('refuses a response that is not a page', async () => {
  await withServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end('{}')
  }, async (origin) => {
    await assert.rejects(
      () => createPageLoader()(`${origin}/data.json`),
      error => error.code === 'unsupported-content',
    )
  })
})

test('maps an HTTP failure to a fetch failure', async () => {
  await withServer((_req, res) => {
    res.statusCode = 404
    res.end('not here')
  }, async (origin) => {
    await assert.rejects(
      () => createPageLoader()(`${origin}/missing`),
      error => error.code === 'fetch-failed' && /HTTP 404/u.test(error.message),
    )
  })
})

test('decodes the declared character set', async () => {
  await withServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=gbk')
    res.end(Buffer.from([0xC4, 0xE3]))
  }, async (origin) => {
    const loaded = await createPageLoader()(`${origin}/gbk`)
    assert.equal(loaded.text, '你')
  })
})