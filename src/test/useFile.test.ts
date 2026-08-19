import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFile } from '../hooks/useFile';
import { useAppStore } from '../stores/appStore';
import { useToastStore } from '../stores/toastStore';
import { confirmUnsavedChanges } from '../utils/dialogs';
import { invoke } from '@tauri-apps/api/core';

vi.mock('../utils/dialogs', () => ({
  confirmUnsavedChanges: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedConfirm = vi.mocked(confirmUnsavedChanges);

describe('useFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Запасной ответ для вторичных вызовов (get_recent_files после open/saveAs)
    mockedInvoke.mockResolvedValue([]);
    useAppStore.setState({
      filePath: null,
      content: '',
      isDirty: false,
      recentFiles: [],
    });
    useToastStore.setState({ toasts: [] });
    // Сброс реализации диалога: mockResolvedValue переживает clearAllMocks,
    // иначе поздние тесты получают протухший 'cancel' от ранних
    mockedConfirm.mockReset();
  });

  it('open — должен загрузить файл и обновить состояние', async () => {
    mockedInvoke.mockResolvedValueOnce({
      path: 'C:\\test\\file.md',
      content: '# Тест',
    });

    const { result } = renderHook(() => useFile());

    await act(async () => {
      await result.current.open();
    });

    const state = useAppStore.getState();
    expect(state.filePath).toBe('C:\\test\\file.md');
    expect(state.content).toBe('# Тест');
    expect(state.isDirty).toBe(false);
  });

  it('open — при отмене диалога не должен менять состояние', async () => {
    mockedInvoke.mockRejectedValueOnce('Файл не выбран');

    const { result } = renderHook(() => useFile());

    await act(async () => {
      await result.current.open();
    });

    const state = useAppStore.getState();
    expect(state.filePath).toBeNull();
    expect(state.content).toBe('');
  });

  it('save — при наличии пути должен сохранить файл', async () => {
    useAppStore.setState({
      filePath: 'C:\\test\\file.md',
      content: '# Привет',
      isDirty: true,
    });
    mockedInvoke.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFile());

    await act(async () => {
      await result.current.save();
    });

    expect(mockedInvoke).toHaveBeenCalledWith('save_file', {
      path: 'C:\\test\\file.md',
      content: '# Привет',
    });
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it('save — без пути должен вызывать saveAs', async () => {
    useAppStore.setState({
      filePath: null,
      content: '# Новый файл',
      isDirty: true,
    });
    mockedInvoke.mockResolvedValueOnce('C:\\test\\new.md');

    const { result } = renderHook(() => useFile());

    await act(async () => {
      await result.current.save();
    });

    expect(mockedInvoke).toHaveBeenCalledWith('save_file_as', {
      content: '# Новый файл',
    });
  });

  it('saveAs — должен сохранить файл и обновить путь', async () => {
    useAppStore.setState({
      content: '# Сохранить как',
      isDirty: true,
    });
    mockedInvoke.mockResolvedValueOnce('C:\\test\\saved.md');

    const { result } = renderHook(() => useFile());

    await act(async () => {
      await result.current.saveAs();
    });

    const state = useAppStore.getState();
    expect(state.filePath).toBe('C:\\test\\saved.md');
    expect(state.isDirty).toBe(false);
  });

  it('open — должен обновить recentFiles через getRecentFiles', async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'open_file') {
        return Promise.resolve({ path: 'C:\\test\\file.md', content: '# Тест' });
      }
      if (cmd === 'get_recent_files') {
        return Promise.resolve(['C:\\test\\file.md', 'C:\\test\\old.md']);
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useFile());

    await act(async () => {
      await result.current.open();
    });

    expect(mockedInvoke).toHaveBeenCalledWith('get_recent_files');
    expect(useAppStore.getState().recentFiles).toEqual(['C:\\test\\file.md', 'C:\\test\\old.md']);
  });

  it('saveAs — должен обновить recentFiles через getRecentFiles', async () => {
    useAppStore.setState({
      content: '# Сохранить как',
      isDirty: true,
    });
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'save_file_as') {
        return Promise.resolve('C:\\test\\saved.md');
      }
      if (cmd === 'get_recent_files') {
        return Promise.resolve(['C:\\test\\saved.md']);
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useFile());

    await act(async () => {
      await result.current.saveAs();
    });

    expect(mockedInvoke).toHaveBeenCalledWith('get_recent_files');
    expect(useAppStore.getState().recentFiles).toEqual(['C:\\test\\saved.md']);
  });

  it('openPath — должен открыть файл по пути и обновить recentFiles', async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'read_file') {
        return Promise.resolve('# Недавний');
      }
      if (cmd === 'get_recent_files') {
        return Promise.resolve(['C:\\test\\recent.md']);
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useFile());

    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current.openPath('C:\\test\\recent.md');
    });

    expect(opened).toBe(true);
    expect(mockedInvoke).toHaveBeenCalledWith('read_file', { path: 'C:\\test\\recent.md' });
    const state = useAppStore.getState();
    expect(state.filePath).toBe('C:\\test\\recent.md');
    expect(state.content).toBe('# Недавний');
    expect(state.isDirty).toBe(false);
    expect(mockedInvoke).toHaveBeenCalledWith('get_recent_files');
    expect(state.recentFiles).toEqual(['C:\\test\\recent.md']);
  });

  it('openPath — при ошибке чтения показывает toast, состояние не меняется', async () => {
    mockedInvoke.mockRejectedValueOnce('ENOENT: файл удалён');

    const { result } = renderHook(() => useFile());

    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current.openPath('C:\\test\\deleted.md');
    });

    expect(opened).toBe(false);
    const state = useAppStore.getState();
    expect(state.filePath).toBeNull();
    expect(state.content).toBe('');
    // Ошибка уходит в toast с текстом из i18n (язык по умолчанию — ru)
    const toasts = useToastStore.getState().toasts;
    expect(
      toasts.some((toast) => toast.type === 'error' && toast.message === 'Не удалось открыть файл'),
    ).toBe(true);
  });

  it('openPath — при отмене в диалоге несохранённых изменений файл не читается', async () => {
    useAppStore.setState({
      filePath: 'C:\\test\\current.md',
      content: 'черновик',
      isDirty: true,
    });
    mockedConfirm.mockResolvedValue('cancel');

    const { result } = renderHook(() => useFile());

    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current.openPath('C:\\test\\recent.md');
    });

    expect(opened).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalledWith('read_file', expect.anything());
    const state = useAppStore.getState();
    expect(state.filePath).toBe('C:\\test\\current.md');
    expect(state.content).toBe('черновик');
    expect(state.isDirty).toBe(true);
  });

  it('openPath — выбор «не сохранять» в диалоге: файл открывается поверх черновика', async () => {
    useAppStore.setState({
      filePath: 'C:\\test\\current.md',
      content: 'черновик',
      isDirty: true,
    });
    mockedConfirm.mockResolvedValue('discard');
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'read_file') {
        return Promise.resolve('# Недавний');
      }
      if (cmd === 'get_recent_files') {
        return Promise.resolve(['C:\\test\\recent.md']);
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useFile());

    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current.openPath('C:\\test\\recent.md');
    });

    expect(opened).toBe(true);
    const state = useAppStore.getState();
    expect(state.filePath).toBe('C:\\test\\recent.md');
    expect(state.content).toBe('# Недавний');
    expect(state.isDirty).toBe(false);
  });

  it('openPath — гонка: побеждает последний вызов, поздний резолв первого игнорируется', async () => {
    const resolvers = new Map<string, (text: string) => void>();
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === 'read_file') {
        const path = (args as { path: string }).path;
        return new Promise<string>((resolve) => {
          resolvers.set(path, resolve);
        });
      }
      if (cmd === 'get_recent_files') {
        return Promise.resolve([]);
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useFile());

    // Оба вызова стартуют до резолва read_file (медленный диск)
    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    await act(async () => {
      first = result.current.openPath('C:\\test\\first.md');
    });
    await act(async () => {
      second = result.current.openPath('C:\\test\\second.md');
    });

    // Второй файл резолвится раньше первого
    await act(async () => {
      resolvers.get('C:\\test\\second.md')?.('# Второй');
      await second;
    });
    await act(async () => {
      resolvers.get('C:\\test\\first.md')?.('# Первый');
      await first;
    });

    // Открыт именно второй (последний выбранный), поздний резолв первого проигнорирован
    expect(await second).toBe(true);
    expect(await first).toBe(false);
    const state = useAppStore.getState();
    expect(state.filePath).toBe('C:\\test\\second.md');
    expect(state.content).toBe('# Второй');
  });

  it('openPath — пока файл читался, документ стал грязным: загрузка прерывается, текст не затирается', async () => {
    let resolveRead: ((text: string) => void) | undefined;
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'read_file') {
        return new Promise<string>((resolve) => {
          resolveRead = resolve;
        });
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFile());

    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = result.current.openPath('C:\\test\\recent.md');
    });

    // Пока read_file висит, пользователь напечатал текст — документ стал грязным
    await act(async () => {
      useAppStore.setState({ content: 'напечатано', isDirty: true });
    });

    await act(async () => {
      resolveRead?.('# Недавний');
      await pending;
    });

    expect(await pending).toBe(false);
    const state = useAppStore.getState();
    expect(state.content).toBe('напечатано');
    expect(state.isDirty).toBe(true);
    expect(state.filePath).toBeNull();
  });
});
