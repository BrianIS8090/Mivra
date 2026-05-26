import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../stores/appStore';
import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useAppStore.setState({
      fontFamily: 'Segoe UI Variable',
      fontSize: 15,
      theme: 'system',
      recentFiles: [],
      enabledPlugins: ['export-pdf'],
      removedBundledPlugins: [],
    });
    // Мок read_settings при монтировании
    mockedInvoke.mockResolvedValue({
      font_family: 'Segoe UI Variable',
      font_size: 15,
      theme: 'system',
      recent_files: [],
      enabled_plugins: ['export-pdf'],
      removed_bundled_plugins: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('должен загрузить настройки при монтировании', async () => {
    mockedInvoke.mockResolvedValueOnce({
      font_family: 'Georgia',
      font_size: 18,
      theme: 'dark',
      recent_files: ['file.md'],
      enabled_plugins: ['export-pdf'],
      removed_bundled_plugins: [],
    });

    renderHook(() => useSettings());

    // Дождаться выполнения промиса
    await vi.runAllTimersAsync();

    const state = useAppStore.getState();
    expect(state.fontFamily).toBe('Georgia');
    expect(state.fontSize).toBe(18);
    expect(state.theme).toBe('dark');
  });

  it('changeFontFamily — должен обновлять шрифт', () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.changeFontFamily('Consolas');
    });

    expect(useAppStore.getState().fontFamily).toBe('Consolas');
  });

  it('changeFontSize — должен ограничивать размер от 10 до 32', () => {
    const { result } = renderHook(() => useSettings());

    act(() => result.current.changeFontSize(5));
    expect(useAppStore.getState().fontSize).toBe(10);

    act(() => result.current.changeFontSize(50));
    expect(useAppStore.getState().fontSize).toBe(32);

    act(() => result.current.changeFontSize(20));
    expect(useAppStore.getState().fontSize).toBe(20);
  });

  it('changeTheme — должен переключать тему', () => {
    const { result } = renderHook(() => useSettings());

    act(() => result.current.changeTheme('dark'));
    expect(useAppStore.getState().theme).toBe('dark');

    act(() => result.current.changeTheme('light'));
    expect(useAppStore.getState().theme).toBe('light');
  });

  it('должен сохранять список включённых плагинов', async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'read_settings') {
        return Promise.resolve({
          font_family: 'Segoe UI Variable',
          font_size: 15,
          theme: 'system',
          recent_files: [],
          enabled_plugins: ['export-pdf'],
          removed_bundled_plugins: ['export-pdf'],
        });
      }
      return Promise.resolve(true);
    });

    renderHook(() => useSettings());
    await vi.advanceTimersByTimeAsync(500);

    expect(mockedInvoke).toHaveBeenCalledWith('write_settings', {
      settings: expect.objectContaining({
        enabled_plugins: ['export-pdf'],
        removed_bundled_plugins: ['export-pdf'],
      }),
    });
  });
});
