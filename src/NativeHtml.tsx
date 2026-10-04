import React, {memo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
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
          visit(attrs.alt || '', marks, link);
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
        const nextMarks = {...marks};
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
        if (attrs.dir === 'rtl' || attrs.dir === 'ltr') {
          nextMarks.writingDirection = attrs.dir;
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
            {...inherited, ...marks},
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
    const direction: TextStyle =
      attrs.dir === 'rtl' || attrs.dir === 'ltr'
        ? {
            writingDirection: attrs.dir,
            textAlign: attrs.dir === 'rtl' ? 'right' : 'left',
          }
        : {};
    const textStyle: TextStyle = {
      ...inherited,
      ...direction,
      ...(attrs.textAlign
        ? {textAlign: attrs.textAlign as TextStyle['textAlign']}
        : {}),
      ...(attrs.bold === 'true'
        ? {
            fontWeight: 'bold',
            fontFamily: theme.boldFontFamily || theme.fontFamily,
          }
        : {}),
      ...(attrs.italic === 'true' ? {fontStyle: 'italic'} : {}),
    };
    if (tag === 'hr') {
      return (
        <View
          key={key}
          style={[styles.rule, {borderBottomColor: theme.border}]}
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
      return (
        <ScrollView key={key} horizontal style={styles.table}>
          <View>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tableRow}>
                {row.children
                  .filter(
                    (cell): cell is HtmlElement =>
                      typeof cell !== 'string' &&
                      ['td', 'th'].includes(cell.tag),
                  )
                  .map((cell, cellIndex) => {
                    const span = Math.min(12, numeric(cell.attrs.colspan) || 1);
                    return (
                      <View
                        key={cellIndex}
                        style={{
                          width: 140 * span,
                          padding: 8,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: theme.border,
                          backgroundColor:
                            cell.tag === 'th'
                              ? theme.surface
                              : theme.background,
                        }}>
                        {flow(
                          cell.children,
                          140 * span - 16,
                          cell.tag === 'th'
                            ? {
                                ...textStyle,
                                fontFamily:
                                  theme.boldFontFamily || theme.fontFamily,
                              }
                            : textStyle,
                          href,
                        )}
                      </View>
                    );
                  })}
              </View>
            ))}
          </View>
        </ScrollView>
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
        <View key={key} accessibilityRole="header" style={styles.heading}>
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
      return (
        <React.Fragment key={key}>
          {flow(children, availableWidth, textStyle, href)}
        </React.Fragment>
      );
    }
    return (
      <View
        key={key}
        style={compact ? styles.compactParagraph : styles.paragraph}>
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
