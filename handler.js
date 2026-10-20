/**
 * Request handling for the search page's Host route: one page-private GET
 * endpoint runs one query through the composition's web seam and answers JSON.
 *
 * Kept apart from the plugin entry so the route can be exercised without a
 * running Harness, and so the trust fence and the search call have exactly one
 * implementation.
 * @module dsh-search-screen/handler
 */

/** Absolute pathname of the page's search route. */
export const SEARCH_ROUTE_PATH = '/search-screen/search'

/** Longest accepted query, in UTF-16 code units, before the route refuses it. */
export const MAX_QUERY_LENGTH = 500

/** Longest upstream failure text forwarded to the page, in UTF-16 code units. */
const MAX_ERROR_MESSAGE_LENGTH = 2000

/**
 * Send one JSON response. Search outcomes are live facts, so nothing is cached.
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
 * Read the bounded error text of an upstream failure.
 * @param error - the thrown value, possibly a `WebError`.
 * @returns its message, capped at {@link MAX_ERROR_MESSAGE_LENGTH}.
 */
function errorMessage(error) {
  const text = error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? error.message
    : String(error)
  return text.length > MAX_ERROR_MESSAGE_LENGTH ? `${text.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : text
}

/**
 * Project one source into the fields the page renders, dropping anything else
 * a provider might attach.
 * @param source - a search source from the web seam.
 * @returns the JSON-safe source.
 */
function projectSource(source) {
  return {
    url: source.url,
    ...source.title === undefined ? {} : { title: source.title },
    ...source.snippet === undefined ? {} : { snippet: source.snippet },
    ...source.publishedAt === undefined ? {} : { publishedAt: source.publishedAt },
  }
}

/**
 * Read the trimmed `q` parameter.
 * @param url - the raw request URL.
 * @returns the query, or undefined when no usable query was sent.
 */
function readQuery(url) {
  let parsed
  try {
    parsed = new URL(String(url ?? ''), 'http://localhost')
  } catch {
    // A request URL Node could not parse carries no query this route accepts.
    return undefined
  }
  const query = (parsed.searchParams.get('q') ?? '').trim()
  return query === '' ? undefined : query
}

/**
 * Build the route handler.
 * @param options - the handler's collaborators.
 * @param options.search - runs one query through the web seam.
 * @param options.maxResults - source bound forwarded to the seam.
 * @param options.timeoutMs - per-query deadline in milliseconds.
 * @param options.rejection - optional trust fence: returns the HTTP status to
 *   refuse, or undefined to admit the request.
 * @param options.report - optional reporter for unexpected internal failures.
 * @returns the GET handler.
 */
export function createSearchHandler({ search, maxResults, timeoutMs, rejection = () => undefined, report = () => {} }) {
  return async function handleSearchRequest(req, res) {
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
    const query = readQuery(req.url)
    if (query === undefined) {
      sendJson(res, 400, failure('invalid-query', 'The search route needs a non-empty "q" query parameter.'))
      return
    }
    if (query.length > MAX_QUERY_LENGTH) {
      sendJson(res, 400, failure('query-too-long', `The search query exceeds ${String(MAX_QUERY_LENGTH)} characters.`))
      return
    }

    const controller = new AbortController()
    const startedAt = Date.now()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('search timed out'))
    }, timeoutMs)
    try {
      const result = await search({ query, maxResults }, controller.signal)
      sendJson(res, 200, {
        ok: true,
        query,
        maxResults,
        // The page shows this beside the result count; it measures the seam call
        // only, so it excludes request parsing and JSON encoding.
        tookMs: Date.now() - startedAt,
        sources: result.sources.map(projectSource),
        truncated: result.truncated === true,
        ...result.content === undefined ? {} : { answer: result.content },
      })
    } catch (error) {
      if (timedOut) {
        sendJson(res, 200, failure('search-timeout', `The search did not finish within ${String(timeoutMs)} ms.`))
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
      sendJson(res, 500, failure('search-failed', 'The search route could not complete the request.'))
    } finally {
      clearTimeout(timer)
    }
  }
}
