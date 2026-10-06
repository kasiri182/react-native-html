# @kasiri182/react-native-html

Beta React Native package for a bounded HTML subset. No application providers,
navigation, fonts or translated strings are required. `htmlparser2` supplies parsing;
this package owns the model, cache and native rendering. Tested dependency target:
React 18.3 / React Native 0.77 / FlashList 1.8.3. Broader compatibility is not yet claimed.

## Installation

```sh
npm install --save-exact @kasiri182/react-native-html@0.1.0-beta.1
npm install @shopify/flash-list@1.8.3
```

Requires React 18.3 and React Native 0.77. Use your application's normal iOS pod
installation after adding FlashList. This package contains no custom native module.
No compatibility claim is made for React 19 or FlashList 2.

## Use

```tsx
import {NativeHtml, NativeHtmlList} from '@kasiri182/react-native-html';

<NativeHtml
  html={content}
  width={width}
  baseUrl="https://example.com/article/"
  direction="rtl"
  theme={{
    text: '#222',
    link: '#06c',
    surface: '#eee',
    background: '#fff',
    border: '#ccc',
    accent: '#06c',
  }}
  onLinkPress={openLink}
  onImagePress={openImage}
/>;
```

Use `NativeHtml` inside an existing scrollable screen or comment row. Use `NativeHtmlList`
as the **only vertical scroll owner** for long documents. Give its parent a bounded height
(usually `flex: 1`). It accepts `ListHeaderComponent`, `ListFooterComponent` and an
`estimatedItemSize` hint. Do not nest it inside a vertical ScrollView.

Optional props: `variant` (rich/compact), `fontSize`, `fontScale`, `fontAdjustment`,
`theme.fontFamily`, `theme.boldFontFamily`, `theme.codeFontFamily`, `truncatedMessage`.
The app controls navigation; without `onLinkPress`, links do not navigate. Only HTTP(S)
URLs reach the callback. Image zoom is the consumer's responsibility.

## Performance design

- Exact-string LRU cache: 32 documents / 1M input characters / 30k model nodes. No disk cache.
- At most 512k input characters / 10k nodes / depth 64. A visible notice marks truncation.
- Cold input over 8192 characters parses asynchronously in 2048-character slices, yielding
  with a timer between tasks. This is cooperative JS scheduling, **not a background thread**
  or a guaranteed millisecond deadline. Unmount/replacement aborts work.
- The list segments fragment-only article wrappers (preserving supported inherited styles)
  and recycles blocks through FlashList. Well-formed ol/ul lists with more than 20 direct
  items are chunked into groups of at most 20, preserving numbering and outer margins.
  Paragraphs, tables, blockquotes/pre blocks and individual list items stay intact; a giant
  item or unsupported wrapper can still be expensive. No arbitrary text slicing is used.
  Block models are cached with a WeakMap, not retained independently; treat supplied models
  as immutable. Internal listFragment metadata is not read from server HTML attributes.
- Offscreen rows do not receive image sources. Native placeholders reserve known dimensions;
  unknown dimensions use a fallback ratio and may adjust after loading. Header images belong
  to the caller. This does not guarantee native image-cache eviction.
- Text, image decoding and scrolling use React Native's existing native components. A custom
  Swift/Kotlin/C++ parser is not included: no device profile currently demonstrates that its
  threading benefit outweighs conversion/transfer cost for this workload.

## Supported content

`stylePolicy` defaults to `theme`: HTML colors (text, background and border) and
line-height are ignored to preserve consumer theme and typography. Use `source`
explicitly to enable those declarations. Table layout remains enabled in both modes.
In theme mode, box styling on non-table blocks is also ignored so remote wrappers
cannot override the consumer's content insets. Table and cell layout remain supported.
`NativeHtmlList` accepts `contentPaddingHorizontal` for body-only insets; pass a
renderer `width` matching the list viewport minus twice that padding.

Paragraphs, headings, nested bold/italic/underline/strike/links, line breaks, inline emoji,
block images, nested lists with starts/item values, blockquotes, pre/code and simple tables.
Tables scroll horizontally and support bounded colspan; rowspan/browser CSS layout are not
implemented. Unknown tags preserve children, with no guarantee of original inline layout.

The CSS subset is text-align, direction, bold font-weight, italic font-style, display:none,
color, background-color, padding, margin, line-height, width, border, border-color,
border-width, border-style and border-collapse. Values are validated and restricted to
safe colors, pixel lengths and percentage widths; unsupported declarations are ignored.
Tables support bounded colspan and may scroll horizontally. Script, iframe, form controls,
SVG/math and other active subtrees are dropped. It is not a browser engine.

## Development

```sh
npm ci
npm run verify
npm pack
```

The build generates CommonJS JavaScript and TypeScript declarations in lib. Metro
can consume the published TypeScript source through the react-native entry.
Only the six runtime modules, compiled output, README, changelog and MIT license
are included in the npm package. Tests and synthetic fixtures stay in Git only.

## Release

Run verify, inspect the tarball and test it in a separate React Native consumer
before publishing. Beta versions use the beta dist-tag, not latest. Changes to
supported rendering behavior and public APIs must be recorded in CHANGELOG.md.

Performance optimizations require matched Release-device comparisons. Synthetic
unit tests and reduced render counts are not proof of higher FPS. Images, real
content, iOS/Android and font settings still need application-level validation.

## License

MIT. See LICENSE.
