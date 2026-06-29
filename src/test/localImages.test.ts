import { describe, expect, it, vi } from 'vitest';
import { bytesToBase64, imageMimeTypeFromPath, localImagePathToDataUrl } from '../utils/localImages';
import { readLocalFileBytes } from '../utils/tauri';

vi.mock('../utils/tauri', () => ({
  readLocalFileBytes: vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff])),
}));

describe('localImages', () => {
  it('определяет MIME-тип картинки по расширению', () => {
    expect(imageMimeTypeFromPath('C:\\docs\\a.JPG')).toBe('image/jpeg');
    expect(imageMimeTypeFromPath('C:\\docs\\a.svg?cache=1')).toBe('image/svg+xml');
    expect(imageMimeTypeFromPath('C:\\docs\\a.unknown')).toBe('application/octet-stream');
  });

  it('кодирует байты в base64', () => {
    expect(bytesToBase64(new Uint8Array([0x41, 0x42, 0x43]))).toBe('QUJD');
  });

  it('читает локальную картинку и возвращает data URL', async () => {
    await expect(localImagePathToDataUrl('C:\\docs\\signature.jpg')).resolves.toBe(
      'data:image/jpeg;base64,/9j/',
    );
    expect(readLocalFileBytes).toHaveBeenCalledWith('C:\\docs\\signature.jpg');
  });
});
