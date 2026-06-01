import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMivraPluginApi } from '../plugins/mivraApi';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import type { PluginManifest } from '../plugins/types';

vi.mock('../utils/tauri', () => ({
  s3SecretExists: vi.fn(),
  s3UploadBytes: vi.fn(),
  saveLocalAssetBytes: vi.fn(),
}));

const manifest: PluginManifest = {
  id: 'asset-plugin',
  name: 'Asset Plugin',
  version: '1.0.0',
  description: 'Stores assets',
  author: 'Mivra Team',
  entry: 'index.js',
  permissions: ['assets:write'],
  apiVersion: 1,
};

describe('plugin assets api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      baseDir: 'C:/docs',
      s3: {
        endpoint: 'https://s3.example.com',
        region: 'auto',
        bucket: 'bucket',
        access_key_id: 'key',
        public_base_url: 'https://cdn.example.com',
        prefix: 'mivra',
      },
      s3Verified: true,
    });
  });

  it('при готовом S3 загружает bytes и возвращает markdown изображения', async () => {
    vi.mocked(tauri.s3SecretExists).mockResolvedValue(true);
    vi.mocked(tauri.s3UploadBytes).mockResolvedValue('https://cdn.example.com/mivra/image.png');

    const api = createMivraPluginApi('asset-plugin', manifest);
    const result = await api.assets.saveBytes({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'image.png',
      alt: 'Diagram',
      kind: 'image',
    });

    expect(tauri.s3UploadBytes).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      'image.png',
      expect.any(Object),
    );
    expect(result).toEqual({
      url: 'https://cdn.example.com/mivra/image.png',
      markdown: '![Diagram](https://cdn.example.com/mivra/image.png)',
      storage: 's3',
    });
  });

  it('при неготовом S3 сохраняет bytes в локальные assets', async () => {
    useAppStore.setState({ s3: null, s3Verified: false, baseDir: 'C:/docs' });
    vi.mocked(tauri.s3SecretExists).mockResolvedValue(false);
    vi.mocked(tauri.saveLocalAssetBytes).mockResolvedValue('assets/image.png');

    const api = createMivraPluginApi('asset-plugin', manifest);
    const result = await api.assets.saveBytes({
      bytes: new Uint8Array([4, 5, 6]),
      filename: 'image.png',
      alt: 'Local',
      kind: 'image',
    });

    expect(tauri.saveLocalAssetBytes).toHaveBeenCalledWith(
      new Uint8Array([4, 5, 6]),
      'C:/docs',
      'image.png',
    );
    expect(result).toEqual({
      url: 'assets/image.png',
      markdown: '![Local](assets/image.png)',
      storage: 'local',
    });
  });

  it('без S3 и baseDir возвращает asset_base_dir_missing', async () => {
    useAppStore.setState({ s3: null, s3Verified: false, baseDir: null });

    const api = createMivraPluginApi('asset-plugin', manifest);
    await expect(api.assets.saveBytes({
      bytes: new Uint8Array([1]),
      filename: 'image.png',
      kind: 'image',
    })).rejects.toThrow('asset_base_dir_missing');
  });
});
