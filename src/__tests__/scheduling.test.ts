import {parseHtml, parseHtmlAsync} from '../model';
import {splitHtmlBlocks} from '../blocks';
import {articleHtml} from '../fixtures/samples';

describe('cooperative HTML parsing', () => {
  it('matches synchronous parsing across text, entities, attributes and pre chunk boundaries', async () => {
    const html =
      articleHtml.repeat(20) + '<pre>' + '  x\n'.repeat(100) + '</pre>';
    let yields = 0;
    const result = await parseHtmlAsync(html, {
      chunkSize: 128,
      yieldTask: async () => {
        yields++;
      },
    });
    expect(result).toEqual(parseHtml(html));
    expect(yields).toBeGreaterThan(10);
  });
  it('cancels before work on a replaced or unmounted document', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      parseHtmlAsync(articleHtml, {
        signal: controller.signal,
        yieldTask: async () => {},
      }),
    ).rejects.toMatchObject({name: 'AbortError'});
  });
  it('cancels between chunks', async () => {
    const controller = new AbortController();
    let yields = 0;
    await expect(
      parseHtmlAsync(articleHtml.repeat(10), {
        signal: controller.signal,
        chunkSize: 128,
        yieldTask: async () => {
          if (++yields === 3) {
            controller.abort();
          }
        },
      }),
    ).rejects.toMatchObject({name: 'AbortError'});
    expect(yields).toBe(3);
  });
});

describe('article block segmentation', () => {
  it('unwraps nested article containers without losing direction or text', () => {
    const document = parseHtml(
      '<div dir="rtl"><section><p>A</p><p>B</p></section></div>',
    );
    const blocks = splitHtmlBlocks(document);
    expect(blocks).toHaveLength(2);
    expect(JSON.stringify(blocks[0])).toContain('rtl');
    expect(JSON.stringify(blocks[1])).toContain('B');
    expect(splitHtmlBlocks(document)).toBe(blocks);
  });
  it('preserves inline siblings together and keeps list/table semantics', () => {
    const blocks = splitHtmlBlocks(
      parseHtml(
        'A<strong>B</strong>C<ul><li>D</li></ul><table><tr><td>E</td></tr></table>',
      ),
    );
    expect(blocks).toHaveLength(3);
    expect(blocks[0].children).toHaveLength(3);
  });
  it('carries truncation into a separate visible row', () => {
    const blocks = splitHtmlBlocks({
      children: ['A'],
      nodeCount: 1,
      truncated: true,
    });
    expect(blocks[1].truncated).toBe(true);
  });
});
