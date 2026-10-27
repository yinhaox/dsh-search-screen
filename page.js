/**
 * Request handling for the reader route: one page-private GET endpoint fetches
 * one HTTP(S) page through the Host process and answers the extracted article
 * as JSON.
 *
 * The browser cannot read a cross-origin page, so the page asks this route for
 * the text instead. Fetching, size and time bounds live here; extraction lives
 * in `extract.js`, and the route never caches a live page.
 * @module dsh-search-screen/page
 */

import { extractPage, extractPlain } from './extract.js'

/** Absolute pathname of the page's reader route. */
export const PAGE_ROUTE_PATH = '/search-screen/page'

/** Longest accepted target URL, in UTF-16 code units. */
export const MAX_PAGE_URL_LENGTH = 2048

/** Largest page body the route reads before giving up, in bytes. */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024

/** Largest redirect chain the route follows. */
export const MAX_REDIRECTS = 5

/** Redirect statuses that carry the next location. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Longest upstream failure text forwarded to the page, in UTF-16 code units. */
const MAX_ERROR_MESSAGE_LENGTH = 2000

/** Identification this route sends for the fetch. */
const USER_AGENT = 'Mozilla/5.0 (compatible; dsh-search-screen; +https://github.com/yinhaox/dsh-search-screen)'

/**
 * Send one JSON response. Page contents are live facts, so nothing is cached.
 * @param res - the response the handler owns.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Refuse a method the route does not serve.
 * @param res - the response the handler owns.
 */
function sendMethodNotAllowed(res) {
  res.statusCode = 405
  res.setHeader('allow', 'GET')
  res.end()
}

/**
 * Build one failure body.
 * @param code - stable machine-routable code the page shows beside the message.
 * @param message - human-readable explanation.
 * @returns the response body.
 */
function failure(code, message) {
  return { ok: false, error: { code, message } }
}

/**
 * Build a thrown failure carrying the code the page routes on.
 * @param code - stable machine-routable code.
 * @param message - human-readable explanation.
 * @returns the error to throw.
 */
function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * Read the bounded error text of a thrown value.
 * @param error - the thrown value.
 * @returns its message, capped for the wire.
 */
function errorMessage(error) {
  const text = error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? error.message
    : String(error)
  return text.length > MAX_ERROR_MESSAGE_LENGTH ? `${text.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : text
}

/**
 * Decide whether one IPv4 literal belongs to a loopback, private, link-local,
 * carrier-grade-NAT, or reserved range.
 * @param address - dotted-decimal address.
 * @returns true when the route refuses it.
 */
function isPrivateIpv4(address) {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/u.test(part))) return false
  const numbers = parts.map(Number)
  if (numbers.some(number => number > 255)) return false
  const [first, second] = numbers
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224
}

/**
 * Decide whether one IPv6 literal is loopback, unspecified, unique-local, or
 * link-local, including IPv4-mapped forms.
 * @param address - unbracketed IPv6 address.
 * @returns true when the route refuses it.
 */
function isPrivateIpv6(address) {
  if (address === '::' || address === '::1') return true
  if (/^f[cd][0-9a-f]{2}:/u.test(address)) return true
  if (/^fe[89ab][0-9a-f]:/u.test(address)) return true
  const mapped = /^::ffff:(.+)$/u.exec(address)
  if (mapped === null) return false
  const tail = mapped[1]
  if (tail.includes('.')) return isPrivateIpv4(tail)
  const hextets = tail.split(':')
  if (hextets.length !== 2) return false
  const high = Number.parseInt(hextets[0], 16)
  const low = Number.parseInt(hextets[1], 16)
  if (!Number.isInteger(high) || !Number.isInteger(low)) return false
  return isPrivateIpv4([high >> 8, high & 255, low >> 8, low & 255].join('.'))
}

/**
 * Decide whether one URL host is a local or private target the reader refuses.
 * Only literal addresses and reserved names are judged; DNS is not consulted.
 * @param hostname - the URL's hostname.
 * @returns true when the route refuses the host.
 */
export function isPrivateHostname(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/u, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === 'local' || host.endsWith('.local')) return true
  if (host.endsWith('.internal')) return true
  if (host === 'home.arpa' || host.endsWith('.home.arpa')) return true
  if (host.startsWith('[') && host.endsWith(']')) return isPrivateIpv6(host.slice(1, -1))
  return isPrivateIpv4(host)
}

/**
 * Read the `url` parameter and validate the target the route may fetch.
 * @param url - the raw request URL.
 * @returns the absolute target URL, or the failure to answer with.
 */
function readTarget(url) {
  let parsed
  try {
    parsed = new URL(String(url ?? ''), 'http://localhost')
  } catch {
    // A request URL Node could not parse carries no target this route accepts.
    return { error: codedError('invalid-url', 'The reader route needs a "url" query parameter.') }
  }
  const value = (parsed.searchParams.get('url') ?? '').trim()
  if (value === '') {
    return { error: codedError('invalid-url', 'The reader route needs a non-empty "url" query parameter.') }
  }
  if (value.length > MAX_PAGE_URL_LENGTH) {
    return {
      error: codedError('invalid-url', `The page URL exceeds ${String(MAX_PAGE_URL_LENGTH)} characters.`),
    }
  }
  let target
  try {
    target = new URL(value)
  } catch {
    return { error: codedError('invalid-url', 'The page URL is not an absolute address.') }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { error: codedError('unsupported-protocol', 'Only http and https pages can be read.') }
  }
  if (target.username !== '' || target.password !== '') {
    return { error: codedError('invalid-url', 'The page URL carries embedded credentials.') }
  }
  if (isPrivateHostname(target.hostname)) {
    return { error: codedError('private-host', 'Local and private network addresses are not fetched.') }
  }
  return { url: target.href }
}

/**
 * Sniff the character set of one fetched body.
 * @param bytes - the raw body.
 * @param contentType - the response's content type, possibly carrying a charset.
 * @returns a TextDecoder label.
 */
function sniffCharset(bytes, contentType) {
  const header = /charset\s*=\s*"?([\w-]+)/iu.exec(contentType)
  if (header !== null) return header[1]
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/iu.exec(head)
  return meta?.[1] ?? 'utf-8'
}

/**
 * Decode one body with its declared character set, falling back to UTF-8.
 * @param bytes - the raw body.
 * @param charset - the declared decoder label.
 * @returns the decoded text.
 */
function decode(bytes, charset) {
  let decoder
  try {
    decoder = new TextDecoder(charset, { fatal: false })
  } catch {
    // An unknown label means the declaration is unusable; UTF-8 is the safe read.
    decoder = new TextDecoder('utf-8', { fatal: false })
  }
  return decoder.decode(bytes)
}

/**
 * Read a response body without exceeding the byte budget.
 * @param response - the fetch response.
 * @param maxBytes - largest accepted body size.
 * @returns the body bytes.
 * @throws a coded `page-too-large` failure when the body exceeds the budget.
 */
async function readWithin(response, maxBytes) {
  if (response.body === null) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      throw codedError('page-too-large', `The page exceeds ${String(maxBytes)} bytes.`)
    }
    return buffer
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw codedError('page-too-large', `The page exceeds ${String(maxBytes)} bytes.`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * Build the loader the route uses to read one page.
 * @param options - the loader's collaborators and bounds.
 * @param options.fetchImpl - the fetch implementation, defaulting to global fetch.
 * @param options.maxBytes - largest accepted body size.
 * @param options.maxRedirects - largest followed redirect chain.
 * @param options.userAgent - identification sent with the fetch.
 * @returns the loader.
 */
export function createPageLoader({
  fetchImpl = (...args) => globalThis.fetch(...args),
  maxBytes = MAX_PAGE_BYTES,
  maxRedirects = MAX_REDIRECTS,
  userAgent = USER_AGENT,
} = {}) {
  return async function loadPage(url, signal) {
    let current = url
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      let response
      try {
        response = await fetchImpl(current, {
          signal,
          redirect: 'manual',
          headers: {
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'user-agent': userAgent,
          },
        })
      } catch (error) {
        if (signal?.aborted === true) throw error
        throw codedError('fetch-failed', `The page could not be reached: ${errorMessage(error)}`)
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location')
        if (location === null || location === '') {
          await response.body?.cancel().catch(() => {})
          throw codedError('fetch-failed', 'The page redirected without a location.')
        }
        let next
        try {
          next = new URL(location, current)
        } catch {
          await response.body?.cancel().catch(() => {})
          throw codedError('fetch-failed', 'The page redirected to an address that cannot parse.')
        }
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          await response.body?.cancel().catch(() => {})
          throw codedError('unsupported-protocol', 'The page redirected to a non-web address.')
        }
        // A redirect that stays on its own host changes nothing about the target's
        // reachability; a redirect that moves to a local or private host would
        // widen the route's reach, so it is refused.
        if (isPrivateHostname(next.hostname) && next.hostname.toLowerCase() !== new URL(current).hostname.toLowerCase()) {
          await response.body?.cancel().catch(() => {})
          throw codedError('private-host', 'The page redirected to a local or private address.')
        }
        await response.body?.cancel().catch(() => {})
        current = next.href
        continue
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw codedError('fetch-failed', `The page answered with HTTP ${String(response.status)}.`)
      }

      const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
      const kind = contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml')
        ? 'html'
        : contentType.startsWith('text/plain') ? 'text' : undefined
      if (kind === undefined) {
        await response.body?.cancel().catch(() => {})
        throw codedError(
          'unsupported-content',
          `The page answered with ${contentType === '' ? 'an unknown content type' : contentType}.`,
        )
      }
      const bytes = await readWithin(response, maxBytes)
      return { url: current, contentType, kind, text: decode(bytes, sniffCharset(bytes, contentType)) }
    }
    throw codedError('fetch-failed', 'The page redirected too many times.')
  }
}

/**
 * Build the reader route handler.
 * @param options - the handler's collaborators.
 * @param options.load - reads one page: `(url, signal) => { url, kind, text }`.
 * @param options.timeoutMs - per-page deadline in milliseconds.
 * @param options.rejection - optional trust fence: returns the HTTP status to
 *   refuse, or undefined to admit the request.
 * @param options.report - optional reporter for unexpected internal failures.
 * @returns the GET handler.
 */
export function createPageHandler({ load, timeoutMs, rejection = () => undefined, report = () => {} }) {
  return async function handlePageRequest(req, res) {
    const refused = rejection(req)
    if (refused !== undefined) {
      res.statusCode = refused
      res.end()
      return
    }
    if (req.method !== 'GET') {
      sendMethodNotAllowed(res)
      return
    }
    const target = readTarget(req.url)
    if (target.error !== undefined) {
      sendJson(res, 400, failure(target.error.code, errorMessage(target.error)))
      return
    }

    const controller = new AbortController()
    const startedAt = Date.now()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('page read timed out'))
    }, timeoutMs)
    try {
      const loaded = await load(target.url, controller.signal)
      const page = loaded.kind === 'html' ? extractPage(loaded.text) : extractPlain(loaded.text)
      sendJson(res, 200, {
        ok: true,
        url: typeof loaded.url === 'string' ? loaded.url : target.url,
        tookMs: Date.now() - startedAt,
        ...page,
      })
    } catch (error) {
      if (timedOut) {
        sendJson(res, 200, failure('page-timeout', `Reading the page did not finish within ${String(timeoutMs)} ms.`))
        return
      }
      const code = error !== null && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : undefined
      if (code !== undefined) {
        sendJson(res, 200, failure(code, errorMessage(error)))
        return
      }
      report(error)
      sendJson(res, 500, failure('page-failed', 'The reader route could not complete the request.'))
    } finally {
      clearTimeout(timer)
    }
  }
}