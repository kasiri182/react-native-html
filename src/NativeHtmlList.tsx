import React, {useCallback, useMemo, useRef, useState} from 'react';
import {View, ViewToken} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {NativeHtml, NativeHtmlProps} from './NativeHtml';
import {HtmlDocument, HtmlNode} from './model';
import {splitHtmlBlocks} from './blocks';
import {useHtmlDocument} from './useHtmlDocument';

const viewabilityConfig = {viewAreaCoveragePercentThreshold: 1};
// Documents are immutable, like the splitHtmlBlocks cache. Weak keys do not retain
// old articles. Scan each visited block once, including nested/inline images.
const imagePresence = new WeakMap<HtmlDocument, boolean>();
const containsImage = (node: HtmlNode): boolean =>
  typeof node !== 'string' &&
  (node.tag === 'img' || node.children.some(containsImage));
function hasImages(document: HtmlDocument): boolean {
  const cached = imagePresence.get(document);
  if (cached !== undefined) {
    return cached;
  }
  const result = document.children.some(containsImage);
  imagePresence.set(document, result);
  return result;
}

export interface NativeHtmlListProps extends NativeHtmlProps {
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  estimatedItemSize?: number;
  contentPaddingHorizontal?: number;
}

/** Owns the vertical scroll surface. Never nest in a vertical ScrollView. */
export function NativeHtmlList({
  ListHeaderComponent,
  ListFooterComponent,
  estimatedItemSize = 120,
  contentPaddingHorizontal = 0,
  ...props
}: NativeHtmlListProps) {
  const document = useHtmlDocument(props.html, props.document);
  const blocks = useMemo(
    () => (document ? splitHtmlBlocks(document) : []),
    [document],
  );
  const [visible, setVisible] = useState<ReadonlySet<HtmlDocument>>(
    () => new Set(),
  );
  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: ViewToken[]}) => {
      const next = new Set<HtmlDocument>();
      for (const token of viewableItems) {
        const item = token.item as HtmlDocument;
        if (hasImages(item)) {
          next.add(item);
        }
      }
      setVisible(previous => {
        if (
          previous.size === next.size &&
          [...next].every(item => previous.has(item))
        ) {
          return previous;
        }
        return next;
      });
    },
  ).current;
  const renderItem = useCallback(
    ({item}: {item: HtmlDocument}) => (
      <View style={{paddingHorizontal: contentPaddingHorizontal}}>
        <NativeHtml
          {...props}
          html=""
          document={item}
          loadImages={visible.has(item)}
        />
      </View>
    ),
    [props, visible, contentPaddingHorizontal],
  );
  return (
    <View style={{flex: 1}}>
      <FlashList
        data={blocks}
        renderItem={renderItem}
        keyExtractor={(_, index) => String(index)}
        estimatedItemSize={estimatedItemSize}
        drawDistance={250}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        extraData={visible}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={
          !document ? (
            <View accessibilityLabel="Loading content" style={{height: 32}} />
          ) : null
        }
      />
    </View>
  );
}
