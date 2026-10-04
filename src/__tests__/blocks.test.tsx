import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, Text, View} from 'react-native';
import {parseHtml, HtmlElement} from '../model';
import {splitHtmlBlocks} from '../blocks';
import {NativeHtml} from '../NativeHtml';

const items = (count: number) =>
  Array.from({length: count}, (_, i) => `<li>Item ${i}</li>`).join('');

it('bounds a 1000-item list to 20 direct items per block without mutating the model', () => {
  const document = parseHtml(`<ol>${items(1000)}</ol>`);
  const before = JSON.stringify(document);
  const blocks = splitHtmlBlocks(document);
  expect(blocks).toHaveLength(50);
  expect(
    blocks.every(
      block => (block.children[0] as HtmlElement).children.length <= 20,
    ),
  ).toBe(true);
  expect(JSON.stringify(document)).toBe(before);
  expect(splitHtmlBlocks(document)).toBe(blocks);
});

it('splits styled containers while preserving the ancestor cascade and inline siblings', () => {
  const blocks = splitHtmlBlocks(
    parseHtml(
      '<div dir="rtl" style="text-align:center;font-weight:bold"><section style="font-style:italic">A<strong>B</strong>C<p dir="ltr">D</p><p>E</p></section></div>',
    ),
  );
  expect(blocks).toHaveLength(3);
  const outer = blocks[0].children[0] as HtmlElement;
  expect(outer.attrs).toMatchObject({
    dir: 'rtl',
    textAlign: 'center',
    bold: 'true',
  });
  const inner = outer.children[0] as HtmlElement;
  expect(inner.attrs.italic).toBe('true');
  expect(inner.children).toHaveLength(3);
  let full: renderer.ReactTestRenderer;
  let split: renderer.ReactTestRenderer;
  const document = parseHtml(
    '<div dir="rtl" style="text-align:center;font-weight:bold"><section style="font-style:italic">A<strong>B</strong>C<p dir="ltr">D</p><p>E</p></section></div>',
  );
  act(() => {
    full = renderer.create(
      <NativeHtml html="" document={document} width={320} />,
    );
    split = renderer.create(
      <>
        {splitHtmlBlocks(document).map((block, index) => (
          <NativeHtml key={index} html="" document={block} width={320} />
        ))}
      </>,
    );
  });
  const textStyles = (tree: renderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(Text)
      .map(node => StyleSheet.flatten(node.props.style));
  expect(textStyles(split!)).toEqual(textStyles(full!));
  act(() => {
    full!.unmount();
    split!.unmount();
  });
});

it('keeps short and malformed lists intact and ignores HTML attempts to set fragment metadata', () => {
  for (const html of [
    `<ul>${items(20)}</ul>`,
    `<ol>Unexpected${items(25)}</ol>`,
    `<ol start="1000000000000000000000">${items(25)}</ol>`,
    `<ol>${items(20)}<li value="1000000000000000000000">Huge value</li></ol>`,
  ]) {
    const document = parseHtml(html);
    expect(splitHtmlBlocks(document)[0].children[0]).toBe(document.children[0]);
  }
  const document = parseHtml('<ol listFragment="middle"><li>A</li></ol>');
  expect((document.children[0] as HtmlElement).listFragment).toBeUndefined();
});

it('preserves zero and negative numbering resets exactly at a split boundary', () => {
  const blocks = splitHtmlBlocks(
    parseHtml(
      `<ol start="3">${items(20)}<li value="0">zero</li>${items(
        19,
      )}<li value="-5">negative</li></ol>`,
    ),
  );
  const lists = blocks.map(block => block.children[0] as HtmlElement);
  expect(lists).toHaveLength(3);
  expect(lists[1].attrs.start).toBe('23');
  expect((lists[1].children[0] as HtmlElement).attrs.value).toBe('0');
  expect(lists[2].attrs.start).toBe('20');
  expect((lists[2].children[0] as HtmlElement).attrs.value).toBe('-5');
});

it('retains numbering, nested lists, links, and only the original outer list margins', () => {
  const html = `<ol start="-2">${items(
    19,
  )}<li value="50">Boundary <a href="https://example.com/">link</a><ul><li>Nested</li></ul></li>${items(
    21,
  )}</ol>`;
  const document = parseHtml(html);
  const blocks = splitHtmlBlocks(document);
  expect(blocks).toHaveLength(3);
  const open = jest.fn();
  let full: renderer.ReactTestRenderer;
  let split: renderer.ReactTestRenderer;
  act(() => {
    full = renderer.create(
      <NativeHtml html="" document={document} width={320} />,
    );
    split = renderer.create(
      <>
        {blocks.map((block, index) => (
          <NativeHtml
            key={index}
            html=""
            document={block}
            width={320}
            onLinkPress={open}
          />
        ))}
      </>,
    );
  });
  const markers = (tree: renderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter(value => typeof value === 'string' && /^-?\d+\.$/.test(value));
  expect(markers(split!)).toEqual(markers(full!));
  expect(markers(split!)).toHaveLength(41);
  expect(markers(split!)[20]).toBe('51.');
  const link = split!.root
    .findAllByType(Text)
    .find(node => node.props.accessibilityRole === 'link');
  act(() => link!.props.onPress());
  expect(open).toHaveBeenCalledWith('https://example.com/');
  const listStyles = split!.root
    .findAllByType(View)
    .map(node => StyleSheet.flatten(node.props.style))
    .filter(style => style?.marginVertical === 6);
  // Three outer fragments and the nested list; no paragraph wrappers in this fixture.
  expect(listStyles.filter(style => style.marginTop === 0)).toHaveLength(2);
  expect(listStyles.filter(style => style.marginBottom === 0)).toHaveLength(2);
  act(() => {
    full!.unmount();
    split!.unmount();
  });
});

it('keeps long paragraphs, tables and individual giant list items intact', () => {
  for (const html of [
    `<p>${'text '.repeat(1000)}</p>`,
    '<table><tr><td>A</td></tr></table>',
    `<ul><li>${items(1)}${'long '.repeat(1000)}</li></ul>`,
  ]) {
    const document = parseHtml(html);
    expect(splitHtmlBlocks(document)).toHaveLength(1);
  }
});
