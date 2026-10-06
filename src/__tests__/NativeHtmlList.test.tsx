import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Image, StyleSheet, Text, View} from 'react-native';
import {NativeHtmlList} from '../NativeHtmlList';
import {parseHtml} from '../model';
let mockListProps: any;
let mockListRenders = 0;
it('insets body rows symmetrically without adding padding to the header', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtmlList html="<p>body</p>" width={320}
        contentPaddingHorizontal={15}
        ListHeaderComponent={<View testID="header" />} />,
    );
  });
  expect(tree!.root.findAllByType(View).map(node => StyleSheet.flatten(node.props.style)))
    .toContainEqual({paddingHorizontal: 15});
  expect(tree!.root.findByProps({testID: 'header'}).props.style).toBeUndefined();
  act(() => tree!.unmount());
});
jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: any) => {
    const React = require('react');
    const {View} = require('react-native');
    mockListProps = props;
    mockListRenders++;
    return (
      <View>
        {props.ListHeaderComponent}
        {props.data.slice(0, 2).map((item: any, index: number) => (
          <React.Fragment key={index}>
            {props.renderItem({item, index})}
          </React.Fragment>
        ))}
        {props.ListFooterComponent}
      </View>
    );
  },
}));

it('defers image sources until the row becomes visible and preserves header/footer', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtmlList
        html={
          '<div><p>A</p><img src="https://example.com/a.png" width="200" height="100"><p>B</p></div>'
        }
        width={320}
        ListHeaderComponent={<View testID="header" />}
        ListFooterComponent={<View testID="footer" />}
      />,
    );
  });
  expect(mockListProps.data).toHaveLength(3);
  expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  act(() => {
    mockListProps.onViewableItemsChanged({
      viewableItems: [{item: mockListProps.data[1], index: 1}],
    });
  });
  expect(tree!.root.findByType(Image).props.source.uri).toBe(
    'https://example.com/a.png',
  );
  expect(tree!.root.findByProps({testID: 'header'})).toBeDefined();
  expect(tree!.root.findByProps({testID: 'footer'})).toBeDefined();
  act(() => tree!.unmount());
});

it('mounts only 40 of 1000 list items when two virtualized blocks are requested', () => {
  const document = parseHtml(
    `<ol>${Array.from({length: 1000}, (_, i) => `<li>Item ${i}</li>`).join(
      '',
    )}</ol>`,
  );
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtmlList html="" document={document} width={320} />,
    );
  });
  expect(mockListProps.data).toHaveLength(50);
  const markers = tree!.root
    .findAllByType(Text)
    .filter(
      node =>
        typeof node.props.children === 'string' &&
        /^\d+\.$/.test(node.props.children),
    );
  expect(markers).toHaveLength(40);
  expect(markers[39].props.children).toBe('40.');
  act(() => tree!.unmount());
});

it('does not update the list for text-only visibility changes', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtmlList html="<p>A</p><p>B</p>" width={320} />,
    );
  });
  const initialRenders = mockListRenders;
  for (let index = 0; index < 20; index++) {
    act(() => {
      mockListProps.onViewableItemsChanged({
        viewableItems: [{item: mockListProps.data[index % 2]}],
      });
    });
  }
  expect(mockListRenders - initialRenders).toBe(0);
  act(() => tree!.unmount());
});

it('ignores text movement and duplicate visibility while an image stays visible', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtmlList
        html={'<p>A<img src="https://example.com/a.png"></p><p>B</p>'}
        width={320}
      />,
    );
  });
  const [picture, text] = mockListProps.data;
  act(() =>
    mockListProps.onViewableItemsChanged({viewableItems: [{item: picture}]}),
  );
  const initialRenders = mockListRenders;
  for (const items of [[picture, text], [picture], [picture, text]]) {
    act(() =>
      mockListProps.onViewableItemsChanged({
        viewableItems: items.map(item => ({item})),
      }),
    );
  }
  expect(mockListRenders - initialRenders).toBe(0);
  expect(tree!.root.findAllByType(Image)).toHaveLength(1);
  act(() =>
    mockListProps.onViewableItemsChanged({viewableItems: [{item: text}]}),
  );
  expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  act(() =>
    mockListProps.onViewableItemsChanged({viewableItems: [{item: picture}]}),
  );
  expect(tree!.root.findAllByType(Image)).toHaveLength(1);
  act(() => tree!.unmount());
});

it('updates when equally sized image sets differ, but ignores their ordering', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtmlList
        html={
          '<img src="https://example.com/a.png"><img src="https://example.com/b.png">'
        }
        width={320}
      />,
    );
  });
  const [a, b] = mockListProps.data;
  const show = (items: any[]) =>
    act(() =>
      mockListProps.onViewableItemsChanged({
        viewableItems: items.map(item => ({item})),
      }),
    );
  show([a]);
  expect(tree!.root.findByType(Image).props.source.uri).toBe(
    'https://example.com/a.png',
  );
  show([b]);
  expect(tree!.root.findByType(Image).props.source.uri).toBe(
    'https://example.com/b.png',
  );
  show([a, b]);
  const initialRenders = mockListRenders;
  show([b, a]);
  expect(mockListRenders).toBe(initialRenders);
  expect(tree!.root.findAllByType(Image)).toHaveLength(2);
  act(() => tree!.unmount());
});

it('handles replacement documents without carrying image visibility to recycled rows', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NativeHtmlList
        html={'<img src="https://example.com/a.png">'}
        width={320}
      />,
    );
  });
  act(() =>
    mockListProps.onViewableItemsChanged({
      viewableItems: [{item: mockListProps.data[0]}],
    }),
  );
  act(() =>
    tree!.update(
      <NativeHtmlList
        html={'<p>Replacement<img src="https://example.com/b.png"></p>'}
        width={400}
      />,
    ),
  );
  expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  act(() =>
    mockListProps.onViewableItemsChanged({
      viewableItems: [{item: mockListProps.data[0]}],
    }),
  );
  expect(tree!.root.findByType(Image).props.source.uri).toBe(
    'https://example.com/b.png',
  );
  act(() =>
    tree!.update(<NativeHtmlList html="<p>Text only</p>" width={400} />),
  );
  act(() =>
    mockListProps.onViewableItemsChanged({
      viewableItems: [{item: mockListProps.data[0]}],
    }),
  );
  expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  const initialRenders = mockListRenders;
  act(() => mockListProps.onViewableItemsChanged({viewableItems: []}));
  expect(mockListRenders).toBe(initialRenders);
  act(() => tree!.unmount());
});
