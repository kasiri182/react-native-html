import {HtmlDocument, HtmlElement, HtmlNode} from './model';

const containers = new Set([
  'div',
  'article',
  'section',
  'main',
  'body',
  'html',
  'figure',
]);
const boundaries = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'table',
  'hr',
  'img',
]);
const cache = new WeakMap<HtmlDocument, HtmlDocument[]>();
const listItemsPerBlock = 20;

function splitList(node: HtmlElement): HtmlElement[] {
  if (node.tag !== 'ol' && node.tag !== 'ul') {
    return [node];
  }
  // Do not reinterpret malformed lists or split through an individual li.
  if (
    node.children.some(child =>
      typeof child === 'string' ? !!child.trim() : child.tag !== 'li',
    )
  ) {
    return [node];
  }
  const items = node.children.filter(
    (child): child is HtmlElement => typeof child !== 'string',
  );
  if (items.length <= listItemsPerBlock) {
    return [node];
  }
  const start = Number.parseInt(node.attrs.start, 10);
  let counter = Number.isFinite(start) ? start : 1;
  const fragments: HtmlElement[] = [];
  for (let offset = 0; offset < items.length; offset += listItemsPerBlock) {
    // Stringifying very large numbers uses exponent notation; parseInt in the
    // renderer would then restart at a different value. Keep these lists atomic.
    if (node.tag === 'ol' && !Number.isSafeInteger(counter)) {
      return [node];
    }
    const children = items.slice(offset, offset + listItemsPerBlock);
    fragments.push({
      ...node,
      attrs:
        node.tag === 'ol'
          ? {...node.attrs, start: String(counter)}
          : node.attrs,
      children,
      listFragment: {
        first: offset === 0,
        last: offset + children.length === items.length,
      },
    });
    for (const child of children) {
      const value = Number.parseInt(child.attrs.value, 10);
      if (Number.isFinite(value)) {
        if (node.tag === 'ol' && !Number.isSafeInteger(value)) {
          return [node];
        }
        counter = value;
      }
      counter++;
    }
  }
  return fragments;
}

/** Flatten transparent article wrappers so one outer div cannot defeat virtualization. */
export function splitHtmlBlocks(document: HtmlDocument): HtmlDocument[] {
  const previous = cache.get(document);
  if (previous) {
    return previous;
  }
  const blocks: HtmlDocument[] = [];
  const visit = (nodes: HtmlNode[], ancestors: HtmlElement[]) => {
    let pending: HtmlNode[] = [];
    const append = (children: HtmlNode[]) => {
      // These containers render as fragments, so retaining their style cascade
      // around each block adds no native layout wrapper or duplicated margins.
      for (let index = ancestors.length - 1; index >= 0; index--) {
        children = [{...ancestors[index], children}];
      }
      blocks.push({children, nodeCount: 0, truncated: false});
    };
    const flush = () => {
      if (pending.some(node => typeof node !== 'string' || node.trim())) {
        append(pending);
      }
      pending = [];
    };
    for (const node of nodes) {
      if (typeof node !== 'string' && containers.has(node.tag)) {
        flush();
        const styled =
          node.attrs.dir ||
          node.attrs.textAlign ||
          node.attrs.bold ||
          node.attrs.italic;
        visit(node.children, styled ? [...ancestors, node] : ancestors);
      } else if (typeof node !== 'string' && boundaries.has(node.tag)) {
        flush();
        splitList(node).forEach(part => append([part]));
      } else {
        pending.push(node);
      }
    }
    flush();
  };
  visit(document.children, []);
  if (document.truncated) {
    blocks.push({children: [], nodeCount: 0, truncated: true});
  }
  cache.set(document, blocks);
  return blocks;
}
