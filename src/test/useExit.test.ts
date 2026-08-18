import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useExit } from '../hooks/useExit';
import { useAppStore } from '../stores/appStore';
import { confirmUnsavedChanges } from '../utils/dialogs';
import * as tauri from '../utils/tauri';

vi.mock('../utils/dialogs', () => ({
  confirmUnsavedChanges: vi.fn(),
}));

vi.mock('../utils/tauri', () => ({
  saveFile: vi.fn(),
  saveFileAs: vi.fn(),
}));

const mockedGetCurrentWindow = vi.mocked(getCurrentWindow);
const mockedConfirm = vi.mocked(confirmUnsavedChanges);
const mockedSaveFile = vi.mocked(tauri.saveFile);
const mockedSaveFileAs = vi.mocked(tauri.saveFileAs);

// Обработчик onCloseRequested, который хук регистрирует на окне
type CloseHandler = (event: { preventDefault: () => void }) => Promise<void>;

// Рендерит хук и возвращает мок-окно вместе с зарегистрированным обработчиком.
// setup.ts создаёт новый объект окна на каждый вызов getCurrentWindow,
// поэтому берём именно тот экземпляр, который получил хук при монтировании.
function renderUseExit() {
  renderHook(() => useExit());
  const win = mockedGetCurrentWindow.mock.results.at(-1)?.value as unknown as {
    onCloseRequested: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  const handler = win.onCloseRequested.mock.calls[0][0] as CloseHandler;
  return { win, handler };
}

describe('useExit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      filePath: null,
      content: '',
      isDirty: false,
      language: 'ru',
    });
  });

  it('без несохранённых изменений — обычное закрытие: диалог не показывается', async () => {
    const { win, handler } = renderUseExit();
    const preventDefault = vi.fn();

    await act(async () => {
      await handler({ preventDefault });
    });

    // Закрытие отдаётся системе: без preventDefault и без ручного destroy
    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it('isDirty=true — показывает диалог несохранённых изменений', async () => {
    useAppStore.setState({ isDirty: true });
    mockedConfirm.mockResolvedValue('cancel');
    const { handler } = renderUseExit();
    const preventDefault = vi.fn();

    await act(async () => {
      await handler({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(mockedConfirm).toHaveBeenCalledWith('ru');
  });

  it('выбор «сохранить» — сохраняет по текущему пути и закрывает окно', async () => {
    useAppStore.setState({
      isDirty: true,
      filePath: 'C:\\test\\file.md',
      content: '# Привет',
    });
    mockedConfirm.mockResolvedValue('save');
    mockedSaveFile.mockResolvedValue(true);
    const { win, handler } = renderUseExit();

    await act(async () => {
      await handler({ preventDefault: vi.fn() });
    });

    expect(mockedSaveFile).toHaveBeenCalledWith('C:\\test\\file.md', '# Привет');
    expect(win.destroy).toHaveBeenCalled();
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it('выбор «сохранить» без пути — открывает saveAs, после выбора пути закрывает окно', async () => {
    useAppStore.setState({ isDirty: true, filePath: null, content: '# Новый' });
    mockedConfirm.mockResolvedValue('save');
    mockedSaveFileAs.mockResolvedValue('C:\\test\\saved.md');
    const { win, handler } = renderUseExit();

    await act(async () => {
      await handler({ preventDefault: vi.fn() });
    });

    expect(mockedSaveFileAs).toHaveBeenCalledWith('# Новый');
    expect(win.destroy).toHaveBeenCalled();
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it('выбор «не сохранять» — закрывает окно без сохранения', async () => {
    useAppStore.setState({
      isDirty: true,
      filePath: 'C:\\test\\file.md',
      content: '# Привет',
    });
    mockedConfirm.mockResolvedValue('discard');
    const { win, handler } = renderUseExit();

    await act(async () => {
      await handler({ preventDefault: vi.fn() });
    });

    expect(mockedSaveFile).not.toHaveBeenCalled();
    expect(mockedSaveFileAs).not.toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalled();
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it('выбор «отмена» — ничего не происходит, окно остаётся', async () => {
    useAppStore.setState({ isDirty: true, filePath: 'C:\\test\\file.md' });
    mockedConfirm.mockResolvedValue('cancel');
    const { win, handler } = renderUseExit();

    await act(async () => {
      await handler({ preventDefault: vi.fn() });
    });

    expect(mockedSaveFile).not.toHaveBeenCalled();
    expect(mockedSaveFileAs).not.toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
    expect(useAppStore.getState().isDirty).toBe(true);
  });
});
