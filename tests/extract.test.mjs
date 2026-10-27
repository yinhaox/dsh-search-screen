/**
 * Reader extraction for dsh-search-screen: title and lead selection, chrome
 * removal, block kinds, entity decoding, root preference, plain text, and the
 * read bounds. Runs with `node --test` and needs no Harness process.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { extractPage, extractPlain, MAX_BLOCKS, MAX_CHARS } from '../extract.js'

/** A representative article page. */
const ARTICLE = `<!doctype html>
<html lang="zh-CN">
<head>
<title>Article title - Site</title>
<meta property="og:title" content="Article title">
<meta name="description" content="A lead &amp; summary.">
<meta property="og:site_name" content="Example">
<style>.x { color: red }</style>
<script>window.tracker = 1</script>
</head>
<body>
<header><nav><a href="/">Home</a> <a href="/about">About</a></nav></header>
<main><article>
<h1>Article title</h1>
<p>First paragraph with <a href="#">a link</a>.</p>
<h2>Section</h2>
<p>Second &#8212; paragraph.</p>
<ul><li>one</li><li>two</li></ul>
<blockquote>Quoted.</blockquote>
<pre><code>const x = 1</code></pre>
<img src="broken.png" alt="dropped">
</article></main>
<footer>Footer text</footer>
</body>
</html>`

test('extracts the title, lead, and blocks of an article', () => {
  const page = extractPage(ARTICLE)
  assert.equal(page.title, 'Article title')
  assert.equal(page.description, 'A lead & summary.')
  assert.equal(page.siteName, 'Example')
  assert.equal(page.lang, 'zh-CN')
  assert.deepEqual(page.blocks.map(block => block.kind), [
    'heading', 'paragraph', 'heading', 'paragraph', 'listItem', 'listItem', 'quote', 'code',
  ])
  assert.equal(page.blocks[0].level, 1)
  assert.equal(page.blocks[1].text, 'First paragraph with a link.')
  assert.equal(page.blocks[2].level, 2)
  assert.equal(page.blocks[3].text, 'Second — paragraph.')
  assert.equal(page.blocks[4].text, 'one')
  assert.equal(page.blocks[6].text, 'Quoted.')
  assert.equal(page.blocks[7].text, 'const x = 1')
  const rendered = page.blocks.map(block => block.text).join('\n')
  assert.doesNotMatch(rendered, /tracker|Home|Footer text|broken\.png/u)
  assert.equal(page.chars, rendered.replace(/\n/gu, '').length)
  assert.equal(page.truncated, false)
})

test('falls back to the document title and keeps the body when there is no article', () => {
  const page = extractPage(`<html><head><title>Plain page</title></head><body>
<header><a href="/">Site home</a></header>
<div><p>Body text.</p><p>Second line.</p></div>
<footer>Footer</footer>
</body></html>`)
  assert.equal(page.title, 'Plain page')
  assert.deepEqual(page.blocks.map(block => block.text), ['Body text.', 'Second line.'])
})

test('decodes named and numeric character references', () => {
  const page = extractPage('<html><body><p>&amp; &#65; &lt;tag&gt; &hellip; &unknown; &#x1F600;</p></body></html>')
  assert.equal(page.blocks[0].text, '& A <tag> … &unknown; 😀')
})

test('keeps line breaks inside preformatted text', () => {
  const page = extractPage('<html><body><pre>line one\nline two</pre></body></html>')
  assert.equal(page.blocks[0].kind, 'code')
  assert.equal(page.blocks[0].text, 'line one\nline two')
})

test('prefers an article root over page chrome that outweighs it', () => {
  const chrome = '<div>' + 'menu '.repeat(100) + '</div>'
  const page = extractPage(`<html><body>${chrome}<article>${'<p>article body text</p>'.repeat(40)}</article>${chrome}</body></html>`)
  const text = page.blocks.map(block => block.text).join(' ')
  assert.equal(page.blocks.length, 40)
  assert.doesNotMatch(text, /menu/u)
  assert.match(text, /article body text/u)
})

test('drops chrome containers by tag and by class', () => {
  const page = extractPage(`<html><body>
  <nav><a href="/">Menu</a></nav>
  <aside>Aside text</aside>
  <table class="infobox"><tr><td>Founded 2023</td></tr></table>
  <div class="mw-editsection">edit</div>
  <article><p>Article text.</p></article>
  <footer>Footer</footer>
  </body></html>`)
  const text = page.blocks.map(block => block.text).join(' ')
  assert.equal(text, 'Article text.')
})

test('keeps an unclosed chrome element from swallowing the page', () => {
  const page = extractPage('<html><body><button>Open<p>Article text.</p></body></html>')
  assert.match(page.blocks.map(block => block.text).join(' '), /Article text\./u)
})

test('bounds the block count and the character count', () => {
  const many = extractPage('<html><body>' + '<p>block</p>'.repeat(MAX_BLOCKS + 20) + '</body></html>', {
    maxBlocks: 5,
  })
  assert.equal(many.blocks.length, 5)
  assert.equal(many.truncated, true)

  const long = extractPage('<html><body><p>' + 'x'.repeat(MAX_CHARS + 10) + '</p></body></html>', {
    maxChars: 100,
  })
  assert.equal(long.blocks[0].text.length, 100)
  assert.equal(long.truncated, true)
})

test('extracts plain text as paragraphs', () => {
  const page = extractPlain('Title line\n\nFirst paragraph\nwrapped.\n\nSecond.\n\n\nThree.')
  assert.equal(page.blocks.length, 4)
  assert.deepEqual(page.blocks.map(block => block.text), [
    'Title line',
    'First paragraph wrapped.',
    'Second.',
    'Three.',
  ])
  assert.equal(page.truncated, false)
})

test('bounds plain text as well', () => {
  const page = extractPlain('aaaa\n\nbbbb\n\ncccc', { maxBlocks: 2 })
  assert.equal(page.blocks.length, 2)
  assert.equal(page.truncated, true)
})