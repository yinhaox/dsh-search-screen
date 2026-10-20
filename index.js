/**
 * dsh-search-screen host half: one GET route that runs a page query through the
 * composition's web seam (`ctx.web`). The browser half (`client.js`) is the
 * sidebar entry and the search page that calls this route.
 *
 * The route reads the same provider selection the model-facing `web_search`
 * tool uses, so a deployment configures search once and both surfaces follow
 * it. Authentication, cancellation, and error mapping live in `handler.js`.
 * @module dsh-search-screen
 */

import { createSearchHandler, SEARCH_ROUTE_PATH } from './handler.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'search-screen'

/** Required services: the browser HTTP carrier and the web access seam. */
export const inject = ['webServer', 'web']

/** Sources the page asks for when the row does not set `maxResults`. */
const DEFAULT_MAX_RESULTS = 8

/** Per-query deadline when the row does not set `timeoutMs`. */
const DEFAULT_TIMEOUT_MS = 20_000

/** Largest source bound the seam accepts from this route. */
const MAX_MAX_RESULTS = 20

/** Largest per-query deadline this route offers. */
const MAX_TIMEOUT_MS = 120_000

/**
 * Read one integer config field.
 * @param config - the row's raw config.
 * @param key - field name.
 * @param fallback - value used when the field is absent.
 * @param minimum - smallest accepted value, inclusive.
 * @param maximum - largest accepted value, inclusive.
 * @returns the configured or default integer.
 * @throws when the field is present but outside its range.
 */
function readInteger(config, key, fallback, minimum, maximum) {
  const value = config?.[key]
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`search-screen: config "${key}" must be an integer from ${String(minimum)} to ${String(maximum)}`)
  }
  return value
}

/**
 * Register the page's search route over the composition's web seam.
 * @param ctx - plugin context carrying `webServer` and `web`.
 * @param config - the row's config: optional `maxResults` and `timeoutMs`.
 */
export function apply(ctx, config) {
  const maxResults = readInteger(config, 'maxResults', DEFAULT_MAX_RESULTS, 1, MAX_MAX_RESULTS)
  const timeoutMs = readInteger(config, 'timeoutMs', DEFAULT_TIMEOUT_MS, 1000, MAX_TIMEOUT_MS)
  // The browser connection owns the Host/Origin fence and browser authentication
  // for page routes. A composition without it (headless hosts) has no browser
  // caller to fence off, so the route serves the request unfenced there.
  const connection = ctx.get('connection')
  const logger = ctx.get('logger')
  const handler = createSearchHandler({
    search: (request, signal) => ctx.web.search(request, signal),
    maxResults,
    timeoutMs,
    ...connection === undefined ? {} : { rejection: req => connection.requestRejection(req) },
    report: (error) => { logger?.warn?.(error) },
  })
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: SEARCH_ROUTE_PATH, handler }),
    `search-screen: GET ${SEARCH_ROUTE_PATH}`,
  )
}
