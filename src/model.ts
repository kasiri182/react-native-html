import {Parser} from 'htmlparser2';

export type HtmlNode = string | HtmlElement;
export interface HtmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  /** Internal segmentation metadata, never populated from HTML attributes. */
  listFragment?: {first: boolean; last: boolean};
}
export interface HtmlDocument {
  children: HtmlNode[];
  truncated: boolean;
  nodeCount: number;
}

// Bounds cover retained input and AST size; not an estimate of JS heap bytes.
export const HTML_LIMITS = {
  characters: 512_000,
  nodes: 10_000,
  depth: 64,
  cacheEntries: 32,
  cacheCharacters: 1_000_000,
  cacheNodes: 30_000,
} as const;
const blocked = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'head',
  'button',
  'form',
  'input',
  'textarea',
  'select',
  'svg',
  'math',
  'template',
]);
const allowedAttributes = new Set([
  'href',
  'src',
  'data-src',
  'data-lazy-src',
  'alt',
  'width',
  'height',
  'dir',
  'start',
  'value',
  'colspan',
  'rowspan',
  'class',
]);
const cache = new Map<string, HtmlDocument>();
let cacheCharacters = 0;
let cacheNodes = 0;

export function clearHtmlCache() {
  cache.clear();
  cacheCharacters = 0;
  cacheNodes = 0;
}

export function getHtmlCacheStats() {
  return {entries: cache.size, characters: cacheCharacters, nodes: cacheNodes};
}

/** Single streaming pass; no DOM with parent/sibling pointers or CSS engine. */
function createParseSession(length: number) {
  let stopped = false;
  const result: HtmlDocument = {
    children: [],
    truncated: length > HTML_LIMITS.characters,
    nodeCount: 0,
  };
  const stack: Array<{children: HtmlNode[]; hidden: boolean; pre: boolean}> = [
    {children: result.children, hidden: false, pre: false},
  ];
  const stop = () => {
    stopped = true;
    result.truncated = true;
    parser.pause();
  };
  const parser = new Parser(
    {
      onopentag(tag, attributes) {
        if (
          stack.length >= HTML_LIMITS.depth ||
          result.nodeCount >= HTML_LIMITS.nodes
        ) {
          stop();
          return;
        }
        const parent = stack[stack.length - 1];
        const safeStyle = parseInlineStyle(attributes.style);
        const hidden =
          parent.hidden ||
          blocked.has(tag) ||
          'hidden' in attributes ||
          safeStyle.hidden === 'true';
        const element: HtmlElement = {tag, attrs: {}, children: []};
        if (!hidden) {
          Object.assign(element.attrs, safeStyle);
          for (const key of Object.keys(attributes)) {
            if (allowedAttributes.has(key)) {
              element.attrs[key] = attributes[key];
            }
          }
          parent.children.push(element);
          result.nodeCount++;
        }
        stack.push({
          children: element.children,
          hidden,
          pre: parent.pre || tag === 'pre',
        });
      },
      ontext(value) {
        const parent = stack[stack.length - 1];
        if (parent.hidden) {
          return;
        }
        const text = parent.pre ? value : value.replace(/[\t\r\n\f ]+/g, ' ');
        const last = parent.children.length - 1;
        if (typeof parent.children[last] === 'string') {
          const previous = parent.children[last] as string;
          parent.children[last] =
            previous +
            (!parent.pre && previous.endsWith(' ')
              ? text.replace(/^ +/, '')
              : text);
        } else if (text) {
          if (result.nodeCount >= HTML_LIMITS.nodes) {
            stop();
            return;
          }
          parent.children.push(text);
          result.nodeCount++;
        }
      },
      onclosetag() {
        if (stack.length > 1) {
          stack.pop();
        }
      },
    },
    {decodeEntities: true},
  );
  return {parser, result, isStopped: () => stopped};
}

const colorPattern =
  /^(?:transparent|#[0-9a-f]{3,8}|rgba?\(\s*(?:\d{1,3}|\d{1,3}%)(?:\s*,\s*(?:\d{1,3}|\d{1,3}%)){2}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i;
const lengthPattern = /^(0|(?:\d+(?:\.\d+)?)px)$/;
const widthPattern = /^(0|(?:\d+(?:\.\d+)?)(?:px|%)?)$/;
const lineHeightPattern = /^(?:\d+(?:\.\d+)?|(?:\d+(?:\.\d+)?)px)$/;

const safeColor = (value: string) =>
  colorPattern.test(value) ? value.toLowerCase() : undefined;
const safeLength = (value: string) =>
  lengthPattern.test(value) ? value : undefined;
const safeWidth = (value: string) =>
  widthPattern.test(value) ? value : undefined;

const parseBox = (value: string, prefix: 'stylePadding' | 'styleMargin') => {
  const tokens = value.split(/\s+/);
  if (!tokens.length || tokens.length > 4) {
    return {};
  }
  const values = tokens.map(safeLength);
  if (values.some(item => !item)) return {};
  const [top, right = top, bottom = top, left = right] = values;
  return {
    [`${prefix}Top`]: top,
    [`${prefix}Right`]: right,
    [`${prefix}Bottom`]: bottom,
    [`${prefix}Left`]: left,
  };
};

const parseBorder = (value: string) => {
  if (value === 'none') {
    return {styleBorderWidth: '0'};
  }
  const parts = value.split(/\s+/);
  const width = parts.find(safeLength);
  const style = parts.find(part => ['solid', 'dashed', 'dotted'].includes(part));
  const color = parts.find(safeColor);
  if (!width && !style && !color) {
    return {};
  }
  return {
    ...(width ? {styleBorderWidth: width} : {}),
    ...(style ? {styleBorderStyle: style} : {}),
    ...(color ? {styleBorderColor: color} : {}),
  };
};

// Deliberately small CSS subset. Never passes arbitrary remote styles to native views.
function parseInlineStyle(style = ''): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) {
      continue;
    }
    const name = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration
      .slice(separator + 1)
      .replace(/!important\s*$/i, '')
      .trim()
      .toLowerCase();
    if (
      name === 'text-align' &&
      ['left', 'right', 'center', 'justify'].includes(value)
    ) {
      attrs.textAlign = value;
    }
    if (name === 'direction' && ['rtl', 'ltr'].includes(value)) {
      attrs.dir = value;
    }
    if (
      name === 'font-weight' &&
      ['bold', '600', '700', '800', '900'].includes(value)
    ) {
      attrs.bold = 'true';
    }
    if (name === 'font-style' && value === 'italic') {
      attrs.italic = 'true';
    }
    if (name === 'display' && value === 'none') {
      attrs.hidden = 'true';
    }
    if (name === 'color') {
      const color = safeColor(value);
      if (color) attrs.styleColor = color;
    }
    if (name === 'background-color') {
      const color = safeColor(value);
      if (color) attrs.styleBackgroundColor = color;
    }
    if (name === 'line-height' && lineHeightPattern.test(value)) {
      attrs.styleLineHeight = value;
    }
    if (name === 'width') {
      const width = safeWidth(value);
      if (width) attrs.styleWidth = width;
    }
    if (name === 'padding') {
      Object.assign(attrs, parseBox(value, 'stylePadding'));
    }
    if (name === 'margin') {
      Object.assign(attrs, parseBox(value, 'styleMargin'));
    }
    if (name === 'border') {
      Object.assign(attrs, parseBorder(value));
    }
    if (name === 'border-width') {
      const width = safeLength(value);
      if (width) attrs.styleBorderWidth = width;
    }
    if (name === 'border-color') {
      const color = safeColor(value);
      if (color) attrs.styleBorderColor = color;
    }
    if (name === 'border-style' && ['solid', 'dashed', 'dotted'].includes(value)) {
      attrs.styleBorderStyle = value;
    }
    if (name === 'border-collapse' && ['collapse', 'separate'].includes(value)) {
      attrs.styleBorderCollapse = value;
    }
  }
  return attrs;
}

export function parseHtml(html: string): HtmlDocument {
  const {parser, result} = createParseSession(html.length);
  parser.end(html.slice(0, HTML_LIMITS.characters));
  return result;
}

/** Cooperative scheduling, not a worker: bounded chunks yield between JS tasks. */
export async function parseHtmlAsync(
  html: string,
  options: {
    signal?: AbortSignal;
    chunkSize?: number;
    yieldTask?: () => Promise<void>;
  } = {},
): Promise<HtmlDocument> {
  const chunkSize = Math.max(128, Math.min(8192, options.chunkSize || 2048));
  const yieldTask =
    options.yieldTask ||
    (() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  const {parser, result, isStopped} = createParseSession(html.length);
  const end = Math.min(html.length, HTML_LIMITS.characters);
  const cancelled = () => {
    if (options.signal?.aborted) {
      const error = new Error('HTML parsing cancelled');
      error.name = 'AbortError';
      throw error;
    }
  };
  // Even the first chunk waits so opening a screen can paint its header/placeholder.
  await yieldTask();
  for (let offset = 0; offset < end; offset += chunkSize) {
    cancelled();
    parser.write(html.slice(offset, Math.min(end, offset + chunkSize)));
    if (isStopped()) {
      break;
    }
    if (result.nodeCount >= HTML_LIMITS.nodes) {
      break;
    }
    // A depth limit may pause the parser before the node limit.
    if (result.truncated && html.length <= HTML_LIMITS.characters) {
      break;
    }
    if (offset + chunkSize < end) {
      await yieldTask();
    }
  }
  cancelled();
  parser.end();
  return result;
}

export function peekHtmlDocument(html: string): HtmlDocument | undefined {
  const document = cache.get(html);
  if (document) {
    cache.delete(html);
    cache.set(html, document);
  }
  return document;
}

/** Exact input keys avoid hash collisions. LRU eviction bounds long-lived retention. */
export function getHtmlDocument(html: string): HtmlDocument {
  const existing = cache.get(html);
  if (existing) {
    cache.delete(html);
    cache.set(html, existing);
    return existing;
  }
  return cacheHtmlDocument(html, parseHtml(html));
}

export function cacheHtmlDocument(
  html: string,
  document: HtmlDocument,
): HtmlDocument {
  const existing = peekHtmlDocument(html);
  if (existing) {
    return existing;
  }
  if (!document.truncated && html.length <= HTML_LIMITS.cacheCharacters) {
    while (
      cache.size &&
      (cache.size >= HTML_LIMITS.cacheEntries ||
        cacheCharacters + html.length > HTML_LIMITS.cacheCharacters ||
        cacheNodes + document.nodeCount > HTML_LIMITS.cacheNodes)
    ) {
      const oldest = cache.keys().next().value as string;
      cacheNodes -= cache.get(oldest)!.nodeCount;
      cacheCharacters -= oldest.length;
      cache.delete(oldest);
    }
    cache.set(html, document);
    cacheCharacters += html.length;
    cacheNodes += document.nodeCount;
  }
  return document;
}

/** Remote content can only navigate/load HTTP(S), with explicit relative URL resolution. */
export function resolveHtmlUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  const url = value?.trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) {
    return undefined;
  }
  if (/^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(url)) {
    return url;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return undefined;
  }
  const base = /^(https?):\/\/([^/?#]+)([^?#]*)/i.exec(baseUrl);
  if (!base) {
    return undefined;
  }
  if (url.startsWith('//')) {
    return resolveHtmlUrl(`${base[1]}:${url}`, baseUrl);
  }
  const origin = `${base[1]}://${base[2]}`;
  if (url.startsWith('#')) {
    return baseUrl.split('#')[0] + url;
  }
  if (url.startsWith('?')) {
    return origin + (base[3] || '/') + url;
  }
  const path = url.startsWith('/') ? url : base[3].replace(/[^/]*$/, '') + url;
  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex < 0 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? '' : path.slice(suffixIndex);
  const segments: string[] = [];
  for (const segment of pathname.split('/')) {
    if (segment === '..') {
      segments.pop();
    } else if (segment && segment !== '.') {
      segments.push(segment);
    }
  }
  return `${origin}/${segments.join('/')}${
    segments.length && pathname.endsWith('/') ? '/' : ''
  }${suffix}`;
}
