import {useEffect, useMemo, useState} from 'react';
import {
  cacheHtmlDocument,
  getHtmlDocument,
  HtmlDocument,
  parseHtmlAsync,
  peekHtmlDocument,
} from './model';

export function useHtmlDocument(
  html: string,
  supplied?: HtmlDocument,
): HtmlDocument | undefined {
  const immediate = useMemo(
    () =>
      supplied ||
      peekHtmlDocument(html) ||
      (html.length <= 8192 ? getHtmlDocument(html) : undefined),
    [html, supplied],
  );
  const [completed, setCompleted] = useState<{
    html: string;
    document: HtmlDocument;
  }>();
  useEffect(() => {
    if (immediate) {
      return;
    }
    const controller = new AbortController();
    parseHtmlAsync(html, {signal: controller.signal})
      .then(document => {
        if (!controller.signal.aborted) {
          setCompleted({html, document: cacheHtmlDocument(html, document)});
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          // Preserve a visible failure without logging potentially private HTML.
          if (!controller.signal.aborted) {
            setCompleted({
              html,
              document: {children: [], nodeCount: 0, truncated: true},
            });
          }
        }
      });
    return () => controller.abort();
  }, [html, immediate]);
  return (
    immediate || (completed?.html === html ? completed.document : undefined)
  );
}
