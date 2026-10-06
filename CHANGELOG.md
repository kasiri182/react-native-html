# Changelog

## 0.1.0-beta.1

- Supports a bounded inline CSS subset for `color`, `background-color`, `padding`,
  `margin`, `line-height`, `width`, `border`, `border-color`, `border-width`,
  `border-style`, and `border-collapse`.
- Applies inherited text styling and supported table styles to native rendering,
  including table width allocation and collapsed table borders.
- Adds parser and renderer coverage for a styled RTL market table fixture.

## 0.1.0-beta.0

Initial beta release candidate. Native Text/View/Image rendering, bounded HTML
parsing and LRU caching, cooperative parsing of long input, RTL support, and
FlashList block virtualization with deferred image loading.

Supports a documented subset of HTML/CSS, not a browser layout engine.
No stable device FPS advantage over other renderers is claimed. Compatibility
is currently limited to React 18.3 / React Native 0.77 / FlashList 1.8.3.
