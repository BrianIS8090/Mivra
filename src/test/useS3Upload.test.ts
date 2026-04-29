import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useS3Upload } from '../hooks/useS3Upload';
import { useAppStore } from '../stores/appStore';
import { useToastStore } from '../stores/toastStore';
import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

describe('useS3Upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ s3: null });
    useToastStore.setState({ toasts: [] });
  });

  it('ready=false при отсутствии s3 в state', async () => {
    // bindings.ts оборачивает invoke в typedError → мокаем сырое значение
    mockedInvoke.mockResolvedValue(false);
    const { result } = renderHook(() => useS3Upload());
    // дать эффекту проверки secret_exists завершиться
    await act(() => Promise.resolve());
    expect(result.current.ready).toBe(false);
  });

  it('ready=true когда s3 настроен и secret существует', async () => {
    useAppStore.setState({
      s3: {
        endpoint: 'https://s3.test',
        region: 'r1',
        bucket: 'b',
        access_key_id: 'k',
        public_url_prefix: null,
        path_prefix: null,
      },
    });
    mockedInvoke.mockResolvedValue(true);

    const { result } = renderHook(() => useS3Upload());
    await act(() => Promise.resolve());
    expect(result.current.ready).toBe(true);
  });

  it('uploadAndInsertBytes вызывает s3_upload_bytes IPC', async () => {
    useAppStore.setState({
      s3: {
        endpoint: 'https://s3.test', region: 'r1', bucket: 'b',
        access_key_id: 'k', public_url_prefix: null, path_prefix: null,
      },
    });
    // первый вызов — secret_exists, второй — upload_bytes
    mockedInvoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('https://s3.test/b/file.png');

    const onInsert = vi.fn();
    const { result } = renderHook(() => useS3Upload(onInsert));
    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.uploadAndInsertBytes(new Uint8Array([1, 2, 3]), 'test.png');
    });

    const calls = mockedInvoke.mock.calls;
    const uploadCall = calls.find(([cmd]) => cmd === 's3_upload_bytes');
    expect(uploadCall).toBeDefined();
    expect(onInsert).toHaveBeenCalledWith('test', 'https://s3.test/b/file.png', true);
  });

  it('IPC ошибка показывает toast.error', async () => {
    useAppStore.setState({
      s3: {
        endpoint: 'https://s3.test', region: 'r1', bucket: 'b',
        access_key_id: 'k', public_url_prefix: null, path_prefix: null,
      },
    });
    mockedInvoke
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce('auth_failed: ...');

    const onInsert = vi.fn();
    const { result } = renderHook(() => useS3Upload(onInsert));
    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.uploadAndInsertBytes(new Uint8Array([1]), 'x.png');
    });

    expect(onInsert).not.toHaveBeenCalled();
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });
});
