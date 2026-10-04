import {
  clearHtmlCache,
  getHtmlCacheStats,
  getHtmlDocument,
  HTML_LIMITS,
  HtmlNode,
  parseHtml,
  resolveHtmlUrl,
} from '../model';
import {articleHtml} from '../fixtures/samples';

const plain = (nodes: HtmlNode[]): string =>
  nodes
    .map(node => (typeof node === 'string' ? node : plain(node.children)))
    .join('');

describe('native HTML parser', () => {
  it('normalizes only the supported CSS subset and drops display:none subtrees', () => {
    const document = parseHtml(
      '<div style="display: none !important">hidden</div><p style="text-align:center;font-weight:700;font-style:italic;background:red">shown</p>',
    );
    expect(document.children).toEqual([
      {
        tag: 'p',
        attrs: {textAlign: 'center', bold: 'true', italic: 'true'},
        children: ['shown'],
      },
    ]);
  });
  beforeEach(clearHtmlCache);
  it('preserves nested content, decodes entities and retains NBSP', () => {
    const doc = parseHtml(articleHtml);
    expect(plain(doc.children)).toContain(
      'متن پررنگ تأکید و لینک\u00a0تست HTML.',
    );
    expect(doc.truncated).toBe(false);
  });
  it('recovers omitted closing paragraphs and list items', () => {
    expect(parseHtml('<p>one<p>two').children).toEqual([
      {tag: 'p', attrs: {}, children: ['one']},
      {tag: 'p', attrs: {}, children: ['two']},
    ]);
    expect(plain(parseHtml('<ul><li>A<li>B</ul>after').children)).toBe(
      'ABafter',
    );
  });
  it('drops active/hidden content and event attributes without losing later text', () => {
    const doc = parseHtml(
      '<p onclick="bad()">ok</p><script>bad()</script><iframe>bad</iframe><div hidden>secret</div><img src="/a.png" onerror="bad()">after',
    );
    expect(plain(doc.children)).toBe('okafter');
    expect(JSON.stringify(doc)).not.toContain('bad');
    expect(JSON.stringify(doc)).not.toContain('secret');
  });
  it('preserves unknown-tag children and preformatted whitespace', () => {
    expect(
      plain(
        parseHtml('<unknown>A <em>B</em></unknown><pre> x\n  y</pre>').children,
      ),
    ).toBe('A B x\n  y');
  });
  it('returns the same AST for identical input', () => {
    expect(getHtmlDocument(articleHtml)).toBe(getHtmlDocument(articleHtml));
  });
  it('bounds LRU entries and evicts the least recently used document', () => {
    const oldest = getHtmlDocument('0');
    const retained = getHtmlDocument('1');
    for (let i = 2; i < HTML_LIMITS.cacheEntries; i++) {
      getHtmlDocument(String(i));
    }
    getHtmlDocument('1');
    getHtmlDocument('next');
    expect(getHtmlDocument('1')).toBe(retained);
    expect(getHtmlDocument('0')).not.toBe(oldest);
    expect(getHtmlCacheStats().entries).toBe(HTML_LIMITS.cacheEntries);
  });
  it('bounds cached characters and nodes', () => {
    for (let i = 0; i < 10; i++) {
      getHtmlDocument(`${i}${'<b>x</b>'.repeat(4000)}`);
    }
    for (let i = 0; i < 10; i++) {
      getHtmlDocument(`${i}${'x'.repeat(300000)}`);
    }
    expect(getHtmlCacheStats().characters).toBeLessThanOrEqual(
      HTML_LIMITS.cacheCharacters,
    );
    expect(getHtmlCacheStats().nodes).toBeLessThanOrEqual(
      HTML_LIMITS.cacheNodes,
    );
  });
  it.each([
    'x'.repeat(HTML_LIMITS.characters + 1),
    '<div>'.repeat(HTML_LIMITS.depth + 1),
    '<br>'.repeat(HTML_LIMITS.nodes + 1),
  ])('bounds oversized, deep or node-heavy input', html => {
    const document = getHtmlDocument(html);
    expect(document.truncated).toBe(true);
    expect(document.nodeCount).toBeLessThanOrEqual(HTML_LIMITS.nodes);
    expect(getHtmlCacheStats().entries).toBe(0);
  });
});

describe('HTML URL policy', () => {
  const base = 'https://hub.example.com/t/topic/1';
  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'file:///a',
    'intent:foo',
    'java\nscript:bad',
    '\\evil.test/a',
  ])('rejects %s', url => {
    expect(resolveHtmlUrl(url, base)).toBeUndefined();
  });
  it.each([
    ['/images/a.png', 'https://hub.example.com/images/a.png'],
    ['../other', 'https://hub.example.com/t/other'],
    ['//cdn.example.com/a.png', 'https://cdn.example.com/a.png'],
    ['?q=x', 'https://hub.example.com/t/topic/1?q=x'],
    ['#section', 'https://hub.example.com/t/topic/1#section'],
  ])('resolves %s', (url, expected) => {
    expect(resolveHtmlUrl(url, base)).toBe(expected);
  });
});
