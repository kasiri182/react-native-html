import React, {memo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {useHtmlDocument} from './useHtmlDocument';
import {HtmlDocument, HtmlElement, HtmlNode, resolveHtmlUrl} from './model';

export interface NativeHtmlProps {
  html: string;
  document?: HtmlDocument;
  direction?: 'rtl' | 'ltr';
  theme?: HtmlTheme;
  fontScale?: number;
  fontAdjustment?: number;
  onLinkPress?: (url: string) => void;
  loadImages?: boolean;
  truncatedMessage?: string;
  width: number;
  variant?: 'rich' | 'compact';
  baseUrl?: string;
  fontSize?: number;
  onImagePress?: (url: string) => void;
}

export interface HtmlTheme {
  text: string;
  link: string;
  surface: string;
  background: string;
  border: string;
  accent: string;
  fontFamily?: string;
  boldFontFamily?: string;
  codeFontFamily?: string;
}
export const defaultHtmlTheme: HtmlTheme = {
  text: '#222',
  link: '#1766cc',
  surface: '#eee',
  background: '#fff',
  border: '#ccc',
  accent: '#1766cc',
};
const inlineTags = new Set([
  'a',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'small',
  'mark',
  'code',
  'sub',
  'sup',
]);
const headingSizes: Record<string, number> = {
  h1: 24,
  h2: 20,
  h3: 18,
  h4: 17,
  h5: 16,
  h6: 15,
};
const numeric = (value?: string) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};
const pixel = (value?: string) => {
  if (!value) return undefined;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return match ? Number(match[1]) : value === '0' ? 0 : undefined;
};
const dimension = (value: string | undefined, availableWidth: number) => {
  if (!value) return undefined;
  if (value.endsWith('%')) {
    const percent = Number(value.slice(0, -1));
    return Number.isFinite(percent) ? (availableWidth * percent) / 100 : undefined;
  }
  return pixel(value) ?? numeric(value);
};

const HtmlImage = memo(function HtmlImage({
  uri,
  alt,
  width,
  aspectRatio,
  onPress,
  loadImages,
}: {
  uri: string;
  alt: string;
  width: number;
  aspectRatio?: number;
  onPress?: () => void;
  loadImages: boolean;
}) {
  const [measuredRatio, setMeasuredRatio] = useState<number>();
  const [failed, setFailed] = useState(false);
  const image = !loadImages ? (
    <View
      style={{
        width: '100%',
        aspectRatio: aspectRatio || measuredRatio || 1.6,
        maxHeight: 800,
      }}
    />
  ) : failed ? (
    <Text>{alt}</Text>
  ) : (
    <Image
      source={{uri}}
      accessibilityLabel={alt || undefined}
      resizeMode="contain"
      style={{
        width: '100%',
        maxHeight: 800,
        aspectRatio: aspectRatio || measuredRatio || 1.6,
      }}
      onError={() => setFailed(true)}
      onLoad={event => {
        const source = event.nativeEvent.source;
        if (!aspectRatio && source.width > 0 && source.height > 0) {
          setMeasuredRatio(source.width / source.height);
        }
      }}
    />
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={alt || undefined}
      onPress={onPress}
      style={[styles.image, {maxWidth: width}]}>
      {image}
    </Pressable>
  ) : (
    <View style={[styles.image, {maxWidth: width}]}>{image}</View>
  );
});

/** App-specific HTML subset. Styling is native/theme-owned; remote CSS is not evaluated. */
export const NativeHtml = memo(function NativeHtml({
  html,
  width,
  variant = 'rich',
  baseUrl = '',
  direction = 'ltr',
  theme = defaultHtmlTheme,
  fontScale = 1,
  fontAdjustment = 0,
  onLinkPress,
  loadImages = true,
  truncatedMessage = 'Some content was omitted because it exceeds the display limit.',
  document: suppliedDocument,
  fontSize,
  onImagePress,
}: NativeHtmlProps) {
  const document = useHtmlDocument(html, suppliedDocument);
  const compact = variant === 'compact';
  const rtl = direction === 'rtl';
  const contentWidth = Math.max(1, width);
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const size = Math.max(
    8,
    ((fontSize ?? (compact ? 14 : 15)) + fontAdjustment) * scale,
  );
  const baseStyle: TextStyle = {
    fontFamily: theme.fontFamily,
    color: theme.text,
    fontSize: size,
    lineHeight: size * 1.65,
    textAlign: rtl ? 'right' : 'left',
    writingDirection: rtl ? 'rtl' : 'ltr',
  };

  const textStyleFor = (attrs: Record<string, string>, inherited: TextStyle) => {
    const fontSize = typeof inherited.fontSize === 'number' ? inherited.fontSize : size;
    const lineHeight = attrs.styleLineHeight
      ? attrs.styleLineHeight.endsWith('px')
        ? pixel(attrs.styleLineHeight)
        : Number(attrs.styleLineHeight) * fontSize
      : undefined;
    return {
      ...inherited,
      ...(attrs.dir === 'rtl' || attrs.dir === 'ltr'
        ? {
            writingDirection: attrs.dir,
            textAlign: attrs.dir === 'rtl' ? 'right' : 'left',
          }
        : {}),
      ...(attrs.textAlign
        ? {textAlign: attrs.textAlign as TextStyle['textAlign']}
        : {}),
      ...(attrs.styleColor ? {color: attrs.styleColor} : {}),
      ...(attrs.styleBackgroundColor
        ? {backgroundColor: attrs.styleBackgroundColor}
        : {}),
      ...(lineHeight && Number.isFinite(lineHeight) ? {lineHeight} : {}),
      ...(attrs.bold === 'true'
        ? {
            fontWeight: 'bold',
            fontFamily: theme.boldFontFamily || theme.fontFamily,
          }
        : {}),
      ...(attrs.italic === 'true' ? {fontStyle: 'italic'} : {}),
    } as TextStyle;
  };

  const boxStyleFor = (
    attrs: Record<string, string>,
    availableWidth: number,
  ): ViewStyle => ({
    ...(attrs.styleBackgroundColor
      ? {backgroundColor: attrs.styleBackgroundColor}
      : {}),
    ...(attrs.stylePaddingTop ? {paddingTop: pixel(attrs.stylePaddingTop)} : {}),
    ...(attrs.stylePaddingRight
      ? {paddingRight: pixel(attrs.stylePaddingRight)}
      : {}),
    ...(attrs.stylePaddingBottom
      ? {paddingBottom: pixel(attrs.stylePaddingBottom)}
      : {}),
    ...(attrs.stylePaddingLeft ? {paddingLeft: pixel(attrs.stylePaddingLeft)} : {}),
    ...(attrs.styleMarginTop ? {marginTop: pixel(attrs.styleMarginTop)} : {}),
    ...(attrs.styleMarginRight
      ? {marginRight: pixel(attrs.styleMarginRight)}
      : {}),
    ...(attrs.styleMarginBottom
      ? {marginBottom: pixel(attrs.styleMarginBottom)}
      : {}),
    ...(attrs.styleMarginLeft ? {marginLeft: pixel(attrs.styleMarginLeft)} : {}),
    ...(attrs.styleWidth || attrs.width
      ? {width: dimension(attrs.styleWidth || attrs.width, availableWidth)}
      : {}),
    ...(attrs.styleBorderWidth
      ? {borderWidth: pixel(attrs.styleBorderWidth)}
      : {}),
    ...(attrs.styleBorderColor ? {borderColor: attrs.styleBorderColor} : {}),
    ...(attrs.styleBorderStyle
      ? {borderStyle: attrs.styleBorderStyle as ViewStyle['borderStyle']}
      : {}),
  });

  const hasBoxStyle = (attrs: Record<string, string>) =>
    Object.keys(attrs).some(key =>
      [
        'styleBackgroundColor',
        'stylePaddingTop',
        'styleMarginTop',
        'styleWidth',
        'styleBorderWidth',
        'styleBorderColor',
        'styleBorderStyle',
      ].includes(key),
    );

  const openLink = (url: string) => {
    onLinkPress?.(url);
  };

  // Inline tags are flattened into text runs. Block boundaries always flush to a
  // sibling Text, so even malformed HTML cannot place a View inside a Text.
  function flow(
    nodes: HtmlNode[],
    availableWidth: number,
    inherited: TextStyle = {},
    href?: string,
    pre = false,
  ): React.ReactNode[] {
    const output: React.ReactNode[] = [];
    let runs: React.ReactNode[] = [];
    let meaningful = false;
    let lastSpace = true;
    let runKey = 0;
    const flush = () => {
      if (meaningful) {
        output.push(
          <Text
            key={`text-${output.length}`}
            allowFontScaling={false}
            style={[baseStyle, inherited, pre && styles.preText]}>
            {runs}
          </Text>,
        );
      }
      runs = [];
      meaningful = false;
      lastSpace = true;
    };
    const visit = (node: HtmlNode, marks: TextStyle, link?: string) => {
      if (typeof node === 'string') {
        const collapsed = pre ? node : node.replace(/[\t\r\n\f ]+/g, ' ');
        const text =
          !pre && lastSpace ? collapsed.replace(/^ +/, '') : collapsed;
        if (!text) {
          return;
        }
        meaningful ||= pre || /[^ ]/.test(text);
        lastSpace = text.endsWith(' ');
        if (!link && Object.keys(marks).length === 0) {
          runs.push(text);
        } else {
          runs.push(
            <Text
              key={`run-${runKey++}`}
              style={[
                marks,
                link && {
                  color: theme.link,
                  textDecorationLine: 'underline',
                },
              ]}
              accessibilityRole={link ? 'link' : undefined}
              onPress={link ? () => openLink(link) : undefined}>
              {text}
            </Text>,
          );
        }
        return;
      }
      const {tag, attrs, children} = node;
      const nextMarks = textStyleFor(attrs, marks);
      if (tag === 'br') {
        runs.push('\n');
        meaningful = true;
        lastSpace = true;
      } else if (tag === 'img') {
        const uri = resolveHtmlUrl(
          attrs['data-src'] || attrs['data-lazy-src'] || attrs.src,
          baseUrl,
        );
        if (!uri) {
          visit(attrs.alt || '', nextMarks, link);
          return;
        }
        const imageWidth = numeric(attrs.width);
        const imageHeight = numeric(attrs.height);
        const emoji =
          /(?:^|\s)emoji(?:\s|$)/.test(attrs.class || '') ||
          (imageWidth && imageHeight && imageWidth <= 32 && imageHeight <= 32);
        if (emoji) {
          runs.push(
            <Text
              key={`emoji-${runKey++}`}
              onPress={link ? () => openLink(link) : undefined}
              accessibilityRole={link ? 'link' : undefined}>
              {loadImages ? (
                <Image
                  source={{uri}}
                  accessibilityLabel={attrs.alt}
                  style={styles.emoji}
                />
              ) : (
                attrs.alt || ' '
              )}
            </Text>,
          );
          meaningful = true;
          lastSpace = false;
        } else {
          flush();
          output.push(
            <HtmlImage
              key={`${output.length}-${uri}`}
              uri={uri}
              loadImages={loadImages}
              alt={attrs.alt || ''}
              width={Math.min(availableWidth, imageWidth || availableWidth)}
              aspectRatio={
                imageWidth && imageHeight ? imageWidth / imageHeight : undefined
              }
              onPress={
                link
                  ? () => openLink(link)
                  : onImagePress
                  ? () => onImagePress(uri)
                  : undefined
              }
            />,
          );
        }
      } else if (inlineTags.has(tag)) {
        if (tag === 'strong' || tag === 'b' || attrs.bold === 'true') {
          nextMarks.fontWeight = 'bold';
          nextMarks.fontFamily = theme.boldFontFamily || theme.fontFamily;
        }
        if (tag === 'em' || tag === 'i' || attrs.italic === 'true') {
          nextMarks.fontStyle = 'italic';
        }
        if (tag === 'u') {
          nextMarks.textDecorationLine = 'underline';
        }
        if (tag === 's' || tag === 'del') {
          nextMarks.textDecorationLine = 'line-through';
        }
        if (tag === 'code') {
          nextMarks.fontFamily = theme.codeFontFamily || 'monospace';
          nextMarks.backgroundColor = theme.surface;
        }
        const nextLink =
          tag === 'a' ? resolveHtmlUrl(attrs.href, baseUrl) : link;
        children.forEach(child => visit(child, nextMarks, nextLink));
      } else {
        flush();
        output.push(
          block(
            node,
            availableWidth,
            `${output.length}`,
            {...inherited, ...nextMarks},
            link,
          ),
        );
      }
    };
    nodes.forEach(node => visit(node, {}, href));
    flush();
    return output;
  }

  function block(
    node: HtmlElement,
    availableWidth: number,
    key: string,
    inherited: TextStyle,
    href?: string,
  ): React.ReactNode {
    const {tag, attrs, children} = node;
    const textStyle = inherited;
    if (tag === 'hr') {
      return (
        <View
          key={key}
          style={[styles.rule, boxStyleFor(attrs, availableWidth), {borderBottomColor: theme.border}]}
        />
      );
    }
    if (tag === 'ul' || tag === 'ol') {
      const start = Number.parseInt(attrs.start, 10);
      let counter = Number.isFinite(start) ? start : 1;
      return (
        <View
          key={key}
          style={[
            styles.list,
            boxStyleFor(attrs, availableWidth),
            node.listFragment &&
              !node.listFragment.first &&
              styles.listContinuation,
            node.listFragment &&
              !node.listFragment.last &&
              styles.listContinues,
          ]}>
          {children.map((child, index) => {
            if (typeof child === 'string' || child.tag !== 'li') {
              return null;
            }
            const value = Number.parseInt(child.attrs.value, 10);
            if (Number.isFinite(value)) {
              counter = value;
            }
            const marker = tag === 'ol' ? `${counter++}.` : '•';
            return (
              <View
                key={index}
                style={[
                  styles.listRow,
                  {flexDirection: rtl ? 'row-reverse' : 'row'},
                ]}>
                <Text
                  allowFontScaling={false}
                  style={[baseStyle, styles.marker]}>
                  {marker}
                </Text>
                <View style={styles.grow}>
                  {flow(
                    child.children,
                    Math.max(1, availableWidth - 32),
                    textStyle,
                    href,
                  )}
                </View>
              </View>
            );
          })}
        </View>
      );
    }
    if (tag === 'table') {
      const rows: HtmlElement[] = [];
      const collect = (items: HtmlNode[]) =>
        items.forEach(item => {
          if (typeof item !== 'string') {
            if (item.tag === 'tr') {
              rows.push(item);
            } else if (['thead', 'tbody', 'tfoot'].includes(item.tag)) {
              collect(item.children);
            }
          }
        });
      collect(children);
      const columnCount = Math.max(
        1,
        ...rows.map(row =>
          row.children.reduce(
            (count, cell) =>
              typeof cell !== 'string' && ['td', 'th'].includes(cell.tag)
                ? count + Math.min(12, numeric(cell.attrs.colspan) || 1)
                : count,
            0,
          ),
        ),
      );
      const tableBox = boxStyleFor(attrs, availableWidth);
      const tableWidth =
        dimension(attrs.styleWidth || attrs.width, availableWidth) ||
        Math.max(availableWidth, columnCount * 120);
      const columnWidth = tableWidth / columnCount;
      const collapsed = attrs.styleBorderCollapse === 'collapse';
      return (
        <View key={key} style={[styles.table, tableBox]}>
          <ScrollView horizontal>
          <View style={{width: tableWidth}}>
            {rows.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={[styles.tableRow, boxStyleFor(row.attrs, tableWidth)]}>
                {row.children
                  .filter(
                    (cell): cell is HtmlElement =>
                      typeof cell !== 'string' &&
                      ['td', 'th'].includes(cell.tag),
                  )
                  .map((cell, cellIndex) => {
                    const span = Math.min(12, numeric(cell.attrs.colspan) || 1);
                    const rowStyle = textStyleFor(row.attrs, textStyle);
                    const cellStyle = textStyleFor(cell.attrs, rowStyle);
                    const rowBox = boxStyleFor(row.attrs, tableWidth);
                    const cellBox = boxStyleFor(cell.attrs, tableWidth);
                    const cellWidth =
                      dimension(cell.attrs.styleWidth || cell.attrs.width, tableWidth) ||
                      columnWidth * span;
                    const paddingLeft =
                      typeof cellBox.paddingLeft === 'number'
                        ? cellBox.paddingLeft
                        : 8;
                    const paddingRight =
                      typeof cellBox.paddingRight === 'number'
                        ? cellBox.paddingRight
                        : 8;
                    const cellBorderWidth =
                      cellBox.borderWidth ??
                      rowBox.borderWidth ??
                      tableBox.borderWidth ??
                      StyleSheet.hairlineWidth;
                    return (
                      <View
                        key={cellIndex}
                        style={[cellBox, {
                          width: cellWidth,
                          paddingTop: cellBox.paddingTop ?? 8,
                          paddingRight,
                          paddingBottom: cellBox.paddingBottom ?? 8,
                          paddingLeft,
                          borderWidth: cellBorderWidth,
                          borderColor:
                            cellBox.borderColor ??
                            rowBox.borderColor ??
                            tableBox.borderColor ??
                            theme.border,
                          borderStyle:
                            cellBox.borderStyle ??
                            rowBox.borderStyle ??
                            tableBox.borderStyle ??
                            'solid',
                          backgroundColor:
                            cellBox.backgroundColor ??
                            rowBox.backgroundColor ??
                            (cell.tag === 'th'
                              ? theme.surface
                              : theme.background),
                          ...(collapsed && cellIndex > 0
                            ? {borderLeftWidth: 0}
                            : {}),
                          ...(collapsed && rowIndex > 0
                            ? {borderTopWidth: 0}
                            : {}),
                        }]}>
                        {flow(
                          cell.children,
                          Math.max(1, cellWidth - paddingLeft - paddingRight),
                          cell.tag === 'th'
                            ? {
                                ...cellStyle,
                                fontFamily:
                                  theme.boldFontFamily || theme.fontFamily,
                              }
                            : cellStyle,
                          href,
                        )}
                      </View>
                    );
                  })}
              </View>
            ))}
          </View>
          </ScrollView>
        </View>
      );
    }
    if (tag === 'pre') {
      return (
        <ScrollView
          key={key}
          horizontal
          style={[styles.quote, {backgroundColor: theme.surface}]}>
          {flow(
            children,
            availableWidth,
            {
              ...textStyle,
              fontFamily: theme.codeFontFamily || 'monospace',
              writingDirection: 'ltr',
              textAlign: 'left',
            },
            href,
            true,
          )}
        </ScrollView>
      );
    }
    if (tag === 'blockquote') {
      return (
        <View
          key={key}
          style={[
            styles.quote,
            boxStyleFor(attrs, availableWidth),
            {
              backgroundColor: theme.surface,
              borderRightWidth: rtl ? 3 : 0,
              borderLeftWidth: rtl ? 0 : 3,
              borderColor: theme.accent,
            },
          ]}>
          {flow(children, Math.max(1, availableWidth - 27), textStyle, href)}
        </View>
      );
    }
    if (Object.prototype.hasOwnProperty.call(headingSizes, tag)) {
      const headingSize = Math.max(
        8,
        (headingSizes[tag] + fontAdjustment) * scale,
      );
      return (
        <View
          key={key}
          accessibilityRole="header"
          style={[styles.heading, boxStyleFor(attrs, availableWidth)]}>
          {flow(
            children,
            availableWidth,
            {
              ...textStyle,
              fontFamily: theme.boldFontFamily || theme.fontFamily,
              fontWeight: 'bold',
              fontSize: headingSize,
              lineHeight: headingSize * 1.6,
            },
            href,
          )}
        </View>
      );
    }
    // Unknown/container tags preserve children without imposing a native wrapper.
    if (tag !== 'p' && tag !== 'li' && tag !== 'figcaption') {
      if (hasBoxStyle(attrs)) {
        const box = boxStyleFor(attrs, availableWidth);
        const horizontalPadding =
          (typeof box.paddingLeft === 'number' ? box.paddingLeft : 0) +
          (typeof box.paddingRight === 'number' ? box.paddingRight : 0);
        return (
          <View key={key} style={box}>
            {flow(
              children,
              Math.max(1, availableWidth - horizontalPadding),
              textStyle,
              href,
            )}
          </View>
        );
      }
      return (
        <React.Fragment key={key}>
          {flow(children, availableWidth, textStyle, href)}
        </React.Fragment>
      );
    }
    return (
      <View
        key={key}
        style={[
          compact ? styles.compactParagraph : styles.paragraph,
          boxStyleFor(attrs, availableWidth),
        ]}>
        {flow(children, availableWidth, textStyle, href)}
      </View>
    );
  }

  return (
    <View style={{maxWidth: contentWidth, alignSelf: 'stretch'}}>
      {document ? (
        flow(document.children, contentWidth)
      ) : (
        <View accessibilityLabel="Loading content" style={{height: 24}} />
      )}
      {document?.truncated && <Text style={baseStyle}>{truncatedMessage}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  paragraph: {marginVertical: 6},
  compactParagraph: {marginBottom: 4},
  heading: {marginTop: 16, marginBottom: 8},
  list: {marginVertical: 6},
  listContinuation: {marginTop: 0},
  listContinues: {marginBottom: 0},
  listRow: {marginBottom: 6},
  marker: {width: 32, textAlign: 'center'},
  grow: {flex: 1},
  image: {width: '100%', marginVertical: 8, alignSelf: 'center'},
  emoji: {width: 20, height: 20, resizeMode: 'contain'},
  rule: {borderBottomWidth: StyleSheet.hairlineWidth, marginVertical: 12},
  quote: {padding: 12, marginVertical: 8, borderRadius: 4},
  preText: {
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  table: {marginVertical: 8},
  tableRow: {flexDirection: 'row'},
});
