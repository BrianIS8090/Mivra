import { describe, expect, it, vi } from 'vitest';
import { installLocalImageResolver } from '../components/Editor/localImageResolver';

describe('installLocalImageResolver', () => {
  it('подменяет относительный src картинки на asset URL от baseDir', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<img src="images/signature.jpg" alt="Подпись">';

    const cleanup = installLocalImageResolver(root, 'C:\\docs\\invoice');

    const img = root.querySelector('img');
    await vi.waitFor(() => {
      expect(img?.getAttribute('src')).toBe(
        'https://asset.localhost/C%3A%5Cdocs%5Cinvoice%5Cimages%2Fsignature.jpg',
      );
    });

    cleanup();
  });

  it('при ошибке загрузки asset URL подставляет data URL локальной картинки', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<img src="images/signature.jpg" alt="Подпись">';
    const loadLocalImageDataUrl = vi.fn(async () => 'data:image/jpeg;base64,AAA=');

    const cleanup = installLocalImageResolver(root, 'C:\\docs\\invoice', {
      loadLocalImageDataUrl,
    });

    const img = root.querySelector('img');
    await vi.waitFor(() => {
      expect(img?.getAttribute('src')).toContain('asset.localhost');
    });

    img?.dispatchEvent(new Event('error'));

    await vi.waitFor(() => {
      expect(loadLocalImageDataUrl).toHaveBeenCalledWith('C:\\docs\\invoice\\images/signature.jpg');
      expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,AAA=');
    });

    cleanup();
  });

  it('не трогает внешние и data URL', async () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<img src="https://example.com/a.jpg">',
      '<img src="data:image/png;base64,AAA=">',
    ].join('');

    const cleanup = installLocalImageResolver(root, 'C:\\docs\\invoice');

    await Promise.resolve();

    const imgs = Array.from(root.querySelectorAll('img'));
    expect(imgs.map((img) => img.getAttribute('src'))).toEqual([
      'https://example.com/a.jpg',
      'data:image/png;base64,AAA=',
    ]);

    cleanup();
  });
});
