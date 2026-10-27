/**
 * Reader extraction for the page route: turn one fetched document into the
 * title, lead, and block list the page renders.
 *
 * Deliberately dependency-free. The extractor strips the document chrome,
 * prefers an `article`/`main` root when a page has one, and keeps headings,
 * paragraphs, list items, quotes, and preformatted text. Images, scripts, and
 * styling are dropped, because the reader lays the text out with the host
 * theme instead of trusting the page's own CSS.
 * @module dsh-search-screen/extract
 */

/** Sentinel that separates a kind token from the text it applies to. */
const MARK = '\u0000'

/** Named entities decoded before the text reaches the page. */
const NAMED_ENTITIES = {
  amp: '&',
  apos: '\'',
  bull: '•',
  copy: '©',
  dagger: '†',
  deg: '°',
  divide: '÷',
  dollar: '$',
  euro: '€',
  gt: '>',
  hellip: '…',
  laquo: '«',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  minus: '−',
  nbsp: ' ',
  ndash: '–',
  ne: '≠',
  para: '¶',
  permil: '‰',
  plusmn: '±',
  pound: '£',
  quot: '"',
  raquo: '»',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  sect: '§',
  shy: '',
  times: '×',
  trade: '™',
  yen: '¥',
}

/** Elements whose whole subtree is document chrome, not article text. */
const CHROME_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas',
  'video', 'audio', 'object', 'embed', 'nav', 'aside', 'footer', 'button',
  'select', 'textarea', 'label',
])

/** id/class tokens that mark a container as chrome or navigation furniture. */
const CHROME_NAMES = new Set([
  'ambox', 'breadcrumb', 'breadcrumbs', 'catlinks', 'dropdown', 'infobox',
  'menu', 'metadata', 'mw-editsection', 'mw-jump-link', 'navbar', 'navbox',
  'printfooter', 'references', 'reflist', 'sidebar', 'toolbar', 'toc',
])

/** Elements that never carry text and have no closing tag. */
const VOID_ELEMENTS = /<(?:input|embed|source|track|wbr|area|base|col|link|meta)\b[^>]*>/giu

/** Wrapper tags removed without dropping their content. */
const WRAPPER_TAGS = /<\/?(?:form|fieldset|legend)\b[^>]*>/giu

/** Closing tags that end a text block. */
const BLOCK_CLOSERS = /<\/(?:p|div|section|article|main|address|figure|figcaption|table|thead|tbody|tfoot|tr|td|th|dl|dt|dd|ul|ol|header)\s*>/giu

/** Larger bound on the lead paragraph read from a document. */
const MAX_DESCRIPTION_LENGTH = 500

/** Container names that identify an article body within a larger page. */
const CONTENT_MARKERS = /(?:mw-content-text|article[-_]?(?:body|content|text)|post[-_]?(?:body|content|text)|entry[-_]?(?:body|content)|story[-_]?(?:body|content)|markdown[-_]?body|content[-_]?body|aside[-_]?content|prose)/iu

/** Bound on the title read from a document. */
const MAX_TITLE_LENGTH = 300

/** Largest number of blocks one page may contribute. */
export const MAX_BLOCKS = 1000

/** Largest number of text characters one page may contribute. */
export const MAX_CHARS = 40_000

/**
 * Read the attributes of one tag into a lower-cased map.
 * @param tag - the raw tag text, or an empty string.
 * @returns attribute name to value.
 */
function readAttributes(tag) {
  const attributes = {}
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gu
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

/**
 * Read the `<meta>` declarations of a document.
 * @param html - the raw document.
 * @returns meta name/property to raw content.
 */
function readMeta(html) {
  const meta = {}
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const attributes = readAttributes(tag)
    const key = (attributes.property ?? attributes.name ?? '').toLowerCase()
    if (key !== '' && attributes.content !== undefined) meta[key] = attributes.content
  }
  return meta
}

/**
 * Decode the HTML character references the reader supports.
 * @param text - text with character references.
 * @returns text with the known references replaced.
 */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/giu, (match, body) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const codePoint = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return match
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        // A lone surrogate cannot be constructed; leave the reference as written.
        return match
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named === undefined ? match : named
  })
}

/**
 * Find the `>` that closes one tag, ignoring quoted attribute text.
 * @param html - the fragment.
 * @param start - index of the opening `<`.
 * @returns the index of the closing `>`, or -1 when the tag is unterminated.
 */
function tagEnd(html, start) {
  let quote
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index]
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '>') return index
  }
  return -1
}

/**
 * Remove every tag from a fragment, keeping the text between tags. Quoted
 * attribute values may contain `>`, so the scan cannot stop at the first one.
 * @param html - markup fragment.
 * @returns the text between tags.
 */
function stripTags(html) {
  let text = ''
  let index = 0
  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) {
      text += html.slice(index)
      break
    }
    text += html.slice(index, open)
    const end = tagEnd(html, open)
    if (end === -1) {
      text += html.slice(open)
      break
    }
    index = end + 1
  }
  return text
}

/**
 * Strip tags, decode references, and collapse one line of document text.
 * @param text - text that may contain markup.
 * @returns the plain, single-line text.
 */
function cleanLine(text) {
  return decodeEntities(stripTags(String(text ?? '')))
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Count the visible text of a markup fragment, for root selection only.
 * @param html - markup fragment.
 * @returns the number of non-whitespace characters.
 */
function textLength(html) {
  return stripTags(html).replace(/\s+/gu, '').length
}

/**
 * Read the `<body>` of a document, dropping `<head>`.
 * @param html - the raw document.
 * @returns the body markup, or the document when it has no body tag.
 */
function bodyOf(html) {
  const headless = html.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/giu, ' ')
  const body = /<body\b[^>]*>([\s\S]*)<\/body\s*>/iu.exec(headless)
  return body === null ? headless : body[1]
}

/**
 * Read the inner markup of one element, counting nested tags of the same name.
 * @param html - the fragment that holds the element.
 * @param tagName - the element's tag name.
 * @param start - index just past the element's opening tag.
 * @returns the inner markup, or undefined when the element is never closed.
 */
function innerOf(html, tagName, start) {
  let depth = 1
  let index = start
  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) return undefined
    const tag = readTag(html, open)
    if (tag === undefined) {
      index = open + 1
      continue
    }
    if (tag.name === tagName && !tag.selfClosing) {
      if (tag.closing) {
        depth -= 1
        if (depth === 0) return html.slice(start, open)
      } else {
        depth += 1
      }
    }
    index = tag.end + 1
  }
  return undefined
}

/**
 * Find the container that names itself as the article body, if the page agrees
 * on more than one.
 * @param html - body markup with comments and inert elements already removed.
 * @returns the longest matching container, or undefined.
 */
function findContentContainer(html) {
  let best
  let bestLength = 0
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)(\s[^>]*)?>/giu)) {
    const attributes = match[2] ?? ''
    if (!/(?:id|class)\s*=/iu.test(attributes)) continue
    const names = [...attributes.matchAll(/\b(?:id|class)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu)]
      .map(attribute => attribute[1] ?? attribute[2] ?? '')
    if (!names.some(value => CONTENT_MARKERS.test(value))) continue
    const inner = innerOf(html, match[1], match.index + match[0].length)
    if (inner === undefined) continue
    const length = textLength(inner)
    if (length > bestLength) {
      best = inner
      bestLength = length
    }
  }
  return best
}

/**
 * Pick the element that most likely holds the article body.
 * @param html - body markup with comments and inert elements already removed.
 * @returns the chosen fragment.
 */
function pickRoot(html) {
  const total = textLength(html)
  const content = findContentContainer(html)
  if (content !== undefined && textLength(content) >= Math.max(250, total * 0.2)) return content
  let best = ''
  for (const pattern of [
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/giu,
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/giu,
  ]) {
    for (const match of html.matchAll(pattern)) {
      if (textLength(match[1]) > textLength(best)) best = match[1]
    }
  }
  const length = textLength(best)
  return length >= 250 && length >= total * 0.35 ? best : html
}

/**
 * Read one tag at `start`, without being fooled by `>` inside quoted values.
 * @param html - the fragment.
 * @param start - index of the opening `<`.
 * @returns the tag descriptor, or undefined when this `<` opens no tag.
 */
function readTag(html, start) {
  const end = tagEnd(html, start)
  if (end === -1) return undefined
  const raw = html.slice(start + 1, end)
  const header = /^\/?\s*([a-z][a-z0-9-]*)/iu.exec(raw)
  if (header === null) return undefined
  return {
    name: header[1].toLowerCase(),
    closing: raw.startsWith('/'),
    selfClosing: /\/\s*$/u.test(raw),
    end,
  }
}

/**
 * Find the end of one element's subtree by counting tags of the same name.
 * @param html - the fragment.
 * @param start - index just past the element's opening tag.
 * @param name - the element's tag name.
 * @returns the index just past its closing tag, or -1 when it never closes.
 */
function closingIndexOf(html, start, name) {
  let depth = 1
  let index = start
  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) return -1
    const tag = readTag(html, open)
    if (tag === undefined) {
      index = open + 1
      continue
    }
    if (tag.name === name && !tag.selfClosing) {
      if (tag.closing) {
        depth -= 1
        if (depth === 0) return tag.end + 1
      } else {
        depth += 1
      }
    }
    index = tag.end + 1
  }
  return -1
}

/**
 * Decide whether one element is document chrome rather than article text.
 * @param name - the element's tag name.
 * @param tag - its raw opening tag.
 * @returns true when its whole subtree should be dropped.
 */
function isChrome(name, tag) {
  if (CHROME_TAGS.has(name)) return true
  const attributes = readAttributes(tag)
  const values = `${attributes.id ?? ''} ${attributes.class ?? ''}`
    .toLowerCase()
    .split(/\s+/u)
    .filter(value => value !== '')
  if (values.some(value => CHROME_NAMES.has(value))) return true
  // Word-split class names such as `vector-page-titlebar-toc` or
  // `navigation__menu` still name chrome.
  return values.some(value => value.split(/[^a-z0-9]+/u).some(token => CHROME_NAMES.has(token)))
}

/**
 * Drop whole subtrees that a predicate marks as chrome. An element that never
 * closes is kept, so a truncated document cannot swallow the rest of its text.
 * @param html - markup fragment.
 * @param shouldDrop - decides from the tag name and raw opening tag.
 * @returns the fragment without the dropped subtrees.
 */
function removeElements(html, shouldDrop) {
  let out = ''
  let index = 0
  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) {
      out += html.slice(index)
      break
    }
    out += html.slice(index, open)
    const tag = readTag(html, open)
    if (tag === undefined) {
      out += '<'
      index = open + 1
      continue
    }
    const raw = html.slice(open, tag.end + 1)
    if (!tag.closing && !tag.selfClosing && shouldDrop(tag.name, raw)) {
      const closeAt = closingIndexOf(html, tag.end + 1, tag.name)
      if (closeAt !== -1) {
        out += ' '
        index = closeAt
        continue
      }
    }
    out += raw
    index = tag.end + 1
  }
  return out
}

/**
 * Remove comments, inert elements, and document chrome from a fragment.
 * @param html - markup fragment.
 * @param options - `stripHeader` removes the site header when no article root
 *   was found; an article's own header is kept.
 * @returns the cleaned fragment.
 */
function stripChrome(html, { stripHeader }) {
  const withoutChrome = removeElements(
    html.replace(/<!--[\s\S]*?-->/gu, ' '),
    isChrome,
  )
  const scoped = stripHeader ? removeElements(withoutChrome, name => name === 'header') : withoutChrome
  return scoped.replace(VOID_ELEMENTS, ' ').replace(WRAPPER_TAGS, ' ')
}

/**
 * Normalize one marker-delimited run of text.
 * @param text - run text.
 * @param kind - the block kind the run belongs to.
 * @returns the normalized text, possibly empty.
 */
function normalizeRun(text, kind) {
  const withoutInvisible = text
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
  if (kind === 'code') return withoutInvisible.replace(/^\n+|\n+$/gu, '')
  return withoutInvisible
    .replace(/[ \t\f\v\u00a0]+/gu, ' ')
    .replace(/[ \t]*\n[ \t]*/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

/**
 * Turn marked-up text into block descriptors, respecting the read bounds.
 * @param text - text carrying `MARK`-delimited kind tokens.
 * @param maxBlocks - largest accepted block count.
 * @param maxChars - largest accepted character count.
 * @returns the blocks, the characters kept, and whether anything was cut.
 */
function readBlocks(text, maxBlocks, maxChars) {
  const pieces = text.split(MARK)
  const blocks = []
  let chars = 0
  let truncated = false
  let kind = 'paragraph'
  let level

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]
    if (index % 2 === 1) {
      if (piece === 'P') {
        kind = 'paragraph'
        level = undefined
      } else if (piece === 'LI') {
        kind = 'listItem'
        level = undefined
      } else if (piece === 'PRE') {
        kind = 'code'
        level = undefined
      } else if (piece === 'QUOTE') {
        kind = 'quote'
        level = undefined
      } else if (/^H[1-6]$/u.test(piece)) {
        kind = 'heading'
        level = Number(piece[1])
      } else {
        kind = 'paragraph'
        level = undefined
      }
      continue
    }
    const body = normalizeRun(piece, kind)
    if (body === '') continue
    const runs = kind === 'code'
      ? [body]
      : body.split(/\n{2,}/u).map(run => run.replace(/\n+/gu, ' ').trim()).filter(run => run !== '')
    for (const run of runs) {
      if (blocks.length >= maxBlocks || chars >= maxChars) {
        truncated = true
        break
      }
      const remaining = maxChars - chars
      const clipped = run.slice(0, remaining)
      blocks.push({ kind, ...level === undefined ? {} : { level }, text: clipped })
      chars += clipped.length
      if (clipped.length < run.length) {
        truncated = true
        break
      }
    }
    if (truncated) break
  }
  return { blocks, chars, truncated }
}

/**
 * Convert one cleaned markup fragment into reader blocks.
 * @param html - cleaned markup.
 * @param maxBlocks - largest accepted block count.
 * @param maxChars - largest accepted character count.
 * @returns the blocks, the characters kept, and whether anything was cut.
 */
function toBlocks(html, maxBlocks, maxChars) {
  const text = html
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<h([1-6])\b[^>]*>/giu, (_match, level) => `\n\n${MARK}H${level}${MARK}`)
    .replace(/<\/h[1-6]\s*>/giu, `\n\n${MARK}P${MARK}\n\n`)
    .replace(/<li\b[^>]*>/giu, () => `\n\n${MARK}LI${MARK}`)
    .replace(/<\/li\s*>/giu, `\n\n${MARK}P${MARK}\n\n`)
    .replace(/<pre\b[^>]*>/giu, () => `\n\n${MARK}PRE${MARK}`)
    .replace(/<\/pre\s*>/giu, `\n\n${MARK}P${MARK}\n\n`)
    .replace(/<blockquote\b[^>]*>/giu, () => `\n\n${MARK}QUOTE${MARK}`)
    .replace(/<\/blockquote\s*>/giu, `\n\n${MARK}P${MARK}\n\n`)
    .replace(/<\/(?:ul|ol|dl)\s*>/giu, `\n\n${MARK}P${MARK}\n\n`)
    .replace(BLOCK_CLOSERS, '\n\n')
  return readBlocks(decodeEntities(stripTags(text)), maxBlocks, maxChars)
}

/**
 * Extract the reader view of one HTML document.
 * @param html - the fetched document.
 * @param options - optional block and character bounds.
 * @returns the title, lead, and block list the page renders.
 */
export function extractPage(html, { maxBlocks = MAX_BLOCKS, maxChars = MAX_CHARS } = {}) {
  const source = typeof html === 'string' ? html : ''
  const meta = readMeta(source)
  const documentTag = /<html\b[^>]*>/iu.exec(source)
  const lang = cleanLine(readAttributes(documentTag?.[0] ?? '').lang ?? '')
  const cleaned = stripChrome(bodyOf(source), { stripHeader: false })
  const root = pickRoot(cleaned)
  const { blocks, chars, truncated } = toBlocks(
    stripChrome(root, { stripHeader: root === cleaned }),
    maxBlocks,
    maxChars,
  )
  const title = cleanLine(
    meta['og:title'] ?? meta.title ?? /<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu.exec(source)?.[1] ?? '',
  )
  const description = cleanLine(meta['og:description'] ?? meta.description ?? '')
  const siteName = cleanLine(meta['og:site_name'] ?? '')
  return {
    ...title === '' ? {} : { title: title.slice(0, MAX_TITLE_LENGTH) },
    ...description === '' ? {} : { description: description.slice(0, MAX_DESCRIPTION_LENGTH) },
    ...siteName === '' ? {} : { siteName: siteName.slice(0, MAX_TITLE_LENGTH) },
    ...lang === '' ? {} : { lang: lang.slice(0, 35) },
    blocks,
    chars,
    truncated,
  }
}

/**
 * Extract the reader view of one plain-text document.
 * @param text - the fetched body.
 * @param options - optional block and character bounds.
 * @returns the block list the page renders.
 */
export function extractPlain(text, { maxBlocks = MAX_BLOCKS, maxChars = MAX_CHARS } = {}) {
  const runs = String(text ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .trim()
    .split(/\n{2,}/u)
    .map(run => run.replace(/\s*\n\s*/gu, ' ').trim())
    .filter(run => run !== '')

  const blocks = []
  let chars = 0
  let truncated = false
  for (const run of runs) {
    if (blocks.length >= maxBlocks || chars >= maxChars) {
      truncated = true
      break
    }
    const remaining = maxChars - chars
    const clipped = run.slice(0, remaining)
    blocks.push({ kind: 'paragraph', text: clipped })
    chars += clipped.length
    if (clipped.length < run.length) {
      truncated = true
      break
    }
  }
  return { blocks, chars, truncated }
}