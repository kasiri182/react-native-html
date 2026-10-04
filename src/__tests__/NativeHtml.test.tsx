import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Image, Text, View} from 'react-native';
import {NativeHtml} from '../NativeHtml';
import {articleHtml, commentHtml} from '../fixtures/samples';
const openUniversalUrl = jest.fn();

function render(
  html: string,
  extra: Partial<React.ComponentProps<typeof NativeHtml>> = {},
) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtml
        html={html}
        width={320}
        direction="rtl"
        theme={{
          text: '#333',
          link: '#00f',
          background: '#fff',
          surface: '#eee',
          border: '#ccc',
          accent: '#00f',
          boldFontFamily: 'Example-Bold',
        }}
        onLinkPress={openUniversalUrl}
        baseUrl="https://example.com/"
        {...extra}
      />,
    );
  });
  return tree!;
}

describe('native HTML rendering', () => {
  it('keeps links and emphasis inside paragraphs and divs', () => {
    const tree = render(articleHtml);
    const link = tree.root
      .findAllByType(Text)
      .find(node => node.props.accessibilityRole === 'link');
    expect(link).toBeDefined();
    act(() => link!.props.onPress());
    expect(openUniversalUrl).toHaveBeenCalledWith(
      'https://example.com/coins/bitcoin/',
    );
    expect(JSON.stringify(tree.toJSON())).toContain('Example-Bold');
    expect(JSON.stringify(tree.toJSON())).toContain('بعد تصویر');
    act(() => tree.unmount());
  });
  it('never mounts a View under Text even for block content inside inline tags', () => {
    const tree = render(
      '<span><b>before<div>block<img src="/a.png"></div>after</b></span>',
    );
    tree.root.findAllByType(Text).forEach(text => {
      expect(text.findAllByType(View)).toHaveLength(0);
    });
    act(() => tree.unmount());
  });
  it('renders relative emoji URLs inline and preserves line breaks', () => {
    const tree = render(commentHtml, {
      variant: 'compact',
      baseUrl: 'https://hub.example.com/',
    });
    expect(tree.root.findByType(Image).props.source.uri).toBe(
      'https://hub.example.com/images/emoji/smile.png',
    );
    expect(JSON.stringify(tree.toJSON())).toContain('خط بعد');
    act(() => tree.unmount());
  });
  it('does not make unsafe links actionable', () => {
    const tree = render('<p><a href="javascript:bad()">readable</a></p>');
    expect(
      tree.root.findAllByType(Text).filter(node => node.props.onPress),
    ).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('readable');
    act(() => tree.unmount());
  });
  it('displays ordered-list starts and per-item values', () => {
    const tree = render('<ol start="3"><li>A</li><li value="8">B</li></ol>');
    const content = JSON.stringify(tree.toJSON());
    expect(content).toContain('3.');
    expect(content).toContain('8.');
    act(() => tree.unmount());
  });
});
