import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvTextToMarkdown } from '../../plugins/markitdown-import/src/converters/csv';
import { docxImageToMarkdown } from '../../plugins/markitdown-import/src/converters/docx';
import {
  configurePdfWorker,
  pdfImageObjectToMarkdown,
  pdfImageRefsFromOperatorList,
  pdfPagesToMarkdown,
  pdfTextItemsToMarkdown,
} from '../../plugins/markitdown-import/src/converters/pdf';
import { normalizeTextMarkdown } from '../../plugins/markitdown-import/src/converters/text';
import { sheetRowsToMarkdown } from '../../plugins/markitdown-import/src/converters/xlsx';

describe('markitdown import converters', () => {
  afterEach(() => {
    delete window.__mivraResolvePluginAsset;
  });

  it('normalizeTextMarkdown приводит переносы строк к LF и убирает BOM', () => {
    expect(normalizeTextMarkdown('\uFEFFA\r\nB\rC')).toBe('A\nB\nC');
  });

  it('csvTextToMarkdown формирует markdown table', () => {
    expect(csvTextToMarkdown('Name,Age\nAlice,30')).toBe('| Name | Age |\n| --- | --- |\n| Alice | 30 |');
  });

  it('csvTextToMarkdown экранирует pipe в ячейках', () => {
    expect(csvTextToMarkdown('Name,Note\nAlice,\"A | B\"')).toBe('| Name | Note |\n| --- | --- |\n| Alice | A \\| B |');
  });

  it('docxImageToMarkdown сохраняет изображение через assets api', async () => {
    const saveBytes = vi.fn().mockResolvedValue({
      url: 'assets/docx-image-1.png',
      markdown: '![Picture](assets/docx-image-1.png)',
      storage: 'local',
    });

    const markdown = await docxImageToMarkdown({
      contentType: 'image/png',
      altText: 'Picture',
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
      index: 1,
      assets: { saveBytes },
    });

    expect(saveBytes).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'docx-image-1.png',
      alt: 'Picture',
      kind: 'image',
    });
    expect(markdown).toBe('![Picture](assets/docx-image-1.png)');
  });

  it('sheetRowsToMarkdown формирует раздел листа с таблицей', () => {
    expect(sheetRowsToMarkdown('Лист1', [['A', 'B'], ['1', '2']]))
      .toBe('## Лист1\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('pdfPagesToMarkdown добавляет page markers', () => {
    expect(pdfPagesToMarkdown(['First page', 'Second page']))
      .toBe('<!-- page 1 -->\n\nFirst page\n\n<!-- page 2 -->\n\nSecond page');
  });

  it('pdfTextItemsToMarkdown сохраняет строки, заголовки и списки PDF', () => {
    const markdown = pdfTextItemsToMarkdown([
      { str: 'Симбулатов', transform: [1, 0, 0, 25, 128, 763], width: 90, height: 25 },
      { str: ' ', transform: [1, 0, 0, 0, 218, 763], width: 0, height: 0 },
      { str: 'Артур', transform: [1, 0, 0, 25, 224, 763], width: 60, height: 25 },
      { str: 'Сопроводительное', transform: [1, 0, 0, 11, 42, 579], width: 104, height: 11 },
      { str: 'письмо', transform: [1, 0, 0, 11, 150, 579], width: 40, height: 11 },
      { str: '-', transform: [1, 0, 0, 9, 42, 520], width: 3, height: 9 },
      { str: 'Проектирование', transform: [1, 0, 0, 9, 52, 520], width: 90, height: 9 },
      { str: ',', transform: [1, 0, 0, 9, 142, 520], width: 2, height: 9 },
      { str: 'разработка', transform: [1, 0, 0, 9, 148, 520], width: 70, height: 9 },
    ]);

    expect(markdown).toBe([
      '# Симбулатов Артур',
      '',
      '## Сопроводительное письмо',
      '',
      '- Проектирование, разработка',
    ].join('\n'));
  });

  it('pdfImageRefsFromOperatorList находит image XObject id без рендера всей страницы', () => {
    expect(pdfImageRefsFromOperatorList({
      fnArray: [1, 85, 86, 85],
      argsArray: [[], ['img_p0_1', 72, 72], [{ width: 10, height: 10, kind: 2, data: new Uint8Array(300) }], ['img_p0_1', 72, 72]],
    }, new Set([85]), new Set([86]))).toEqual([
      { id: 'img_p0_1' },
      { image: { width: 10, height: 10, kind: 2, data: new Uint8Array(300) } },
    ]);
  });

  it('pdfImageObjectToMarkdown сохраняет отдельную картинку PDF как PNG через assets api', async () => {
    const putImageData = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        createImageData: (width: number, height: number) => ({
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData,
      })),
      toBlob: vi.fn((callback: BlobCallback) => {
        callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
      }),
    } as unknown as HTMLCanvasElement;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') return canvas;
      return originalCreateElement(tagName);
    });
    const assets = {
      saveBytes: vi.fn().mockResolvedValue({
        markdown: '![resume.pdf, image 1](assets/resume-page-1-image-1.png)',
      }),
    };

    const markdown = await pdfImageObjectToMarkdown({
      image: {
        width: 2,
        height: 1,
        kind: 2,
        data: new Uint8Array([255, 0, 0, 0, 255, 0]),
      },
      pageNumber: 1,
      imageIndex: 1,
      fileName: 'resume.pdf',
      assets,
    });

    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(putImageData).toHaveBeenCalledWith(expect.objectContaining({
      width: 2,
      height: 1,
    }), 0, 0);
    expect(assets.saveBytes).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'resume-page-1-image-1.png',
      alt: 'resume.pdf, page 1, image 1',
      kind: 'image',
    });
    expect(markdown).toBe('![resume.pdf, image 1](assets/resume-page-1-image-1.png)');
  });

  it('configurePdfWorker задаёт workerSrc абсолютным URL относительно entry-модуля', () => {
    const pdfjs = { GlobalWorkerOptions: { workerSrc: '' } };

    configurePdfWorker(
      pdfjs,
      './assets/pdf.worker-test.mjs',
      'https://asset.localhost/plugins/markitdown-import/index.js?mivra_plugin=markitdown-import%401.0.1',
    );

    expect(pdfjs.GlobalWorkerOptions.workerSrc)
      .toBe('https://asset.localhost/plugins/markitdown-import/assets/pdf.worker-test.mjs');
  });

  it('configurePdfWorker использует Mivra asset resolver для worker из пакета плагина', () => {
    const pdfjs = { GlobalWorkerOptions: { workerSrc: '' } };
    const resolvePluginAsset = vi.fn((pluginId: string, relativePath: string) => (
      `https://asset.localhost/plugins/${pluginId}/${relativePath}?mivra_plugin=${pluginId}%401.0.5`
    ));
    window.__mivraResolvePluginAsset = resolvePluginAsset;

    configurePdfWorker(
      pdfjs,
      './assets/pdf.worker-test.mjs',
      'http://asset.localhost/index.js?mivra_plugin=markitdown-import%401.0.5',
    );

    expect(resolvePluginAsset).toHaveBeenCalledWith('markitdown-import', 'assets/pdf.worker-test.mjs');
    expect(pdfjs.GlobalWorkerOptions.workerSrc)
      .toBe('https://asset.localhost/plugins/markitdown-import/assets/pdf.worker-test.mjs?mivra_plugin=markitdown-import%401.0.5');
  });
});
