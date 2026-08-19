import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '../hooks/useAutosave';
import { useAppStore } from '../stores/appStore';
import { useToastStore } from '../stores/toastStore';
import * as tauri from '../utils/tauri';
import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

// Исходное состояние документа: по умолчанию автосохранение включено,
// файл назван, документ чистый. Отдельные тесты переопределяют поля.
function resetStore(overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    filePath: '/test.md',
    content: '',
    isDirty: false,
    autosave: true,
    language: 'ru',
    ...overrides,
  });
  useToastStore.setState({ toasts: [] });
}

// Промокать команду save_file: успех или ошибка записи
function mockSaveFile(impl: 'ok' | 'fail' = 'ok') {
  mockedInvoke.mockImplementation((cmd) => {
    if (cmd === 'save_file') {
      return impl === 'ok' ? Promise.resolve(true) : Promise.reject(new Error('disk full'));
    }
    return Promise.resolve(true);
  });
}

// Промокать save_file с ручным резолвом: каждый вызов «зависает»,
// тест сам решает, когда и в каком порядке завершатся записи
// (имитация медленного диска: сетевой путь, антивирус).
function mockSaveFileManual(): Array<(value: boolean) => void> {
  const resolvers: Array<(value: boolean) => void> = [];
  mockedInvoke.mockImplementation((cmd) => {
    if (cmd === 'save_file') {
      return new Promise<boolean>((resolve) => resolvers.push(resolve));
    }
    return Promise.resolve(true);
  });
  return resolvers;
}

function saveFileCalls() {
  return mockedInvoke.mock.calls.filter(([cmd]) => cmd === 'save_file');
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetStore();
    mockSaveFile();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('сохраняет файл через 2 секунды после последнего изменения', async () => {
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('привет'));

    // До истечения дебаунса записи нет
    await vi.advanceTimersByTimeAsync(1999);
    expect(saveFileCalls()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(saveFileCalls()).toHaveLength(1);
    expect(mockedInvoke).toHaveBeenCalledWith('save_file', {
      path: '/test.md',
      content: 'привет',
    });
  });

  it('дебаунс: новое изменение внутри окна сдвигает таймер', async () => {
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('а'));
    await vi.advanceTimersByTimeAsync(1000);
    act(() => useAppStore.getState().setContent('аб'));

    // С момента первого изменения прошло 2с, но с последнего — только 1с
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFileCalls()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFileCalls()).toHaveLength(1);
    expect(mockedInvoke).toHaveBeenCalledWith('save_file', {
      path: '/test.md',
      content: 'аб',
    });
  });

  it('не сохраняет при выключенном автосохранении', async () => {
    resetStore({ autosave: false });
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('привет'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(saveFileCalls()).toHaveLength(0);
  });

  it('не сохраняет неназванный документ (filePath = null)', async () => {
    resetStore({ filePath: null });
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('привет'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(saveFileCalls()).toHaveLength(0);
  });

  it('не сохраняет чистый документ (isDirty = false)', async () => {
    renderHook(() => useAutosave());

    // Контент загружен программно (открытие файла) — грязный флаг не ставится
    act(() => useAppStore.getState().loadContent('привет'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(saveFileCalls()).toHaveLength(0);
  });

  it('успешная запись сбрасывает isDirty', async () => {
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('привет'));
    expect(useAppStore.getState().isDirty).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);

    expect(saveFileCalls()).toHaveLength(1);
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it('ошибка записи — один тост без спама, повторный тост после нового изменения', async () => {
    mockSaveFile('fail');
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('привет'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(saveFileCalls()).toHaveLength(1);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toBe('Не удалось автосохранить файл');
    // Документ остался грязным — изменения не потеряны из виду
    expect(useAppStore.getState().isDirty).toBe(true);

    // Ретраев и новых тостов без действий пользователя нет
    await vi.advanceTimersByTimeAsync(10000);
    expect(saveFileCalls()).toHaveLength(1);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Новое изменение контента — новая попытка и второй тост
    act(() => useAppStore.getState().setContent('привет мир'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(2);
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it('не сохраняет после размонтирования (cleanup таймера)', async () => {
    const { unmount } = renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('привет'));
    unmount();

    await vi.advanceTimersByTimeAsync(5000);
    expect(saveFileCalls()).toHaveLength(0);
  });

  it('сериализация записей: вторая запись только после завершения первой, диск догоняет стор', async () => {
    const resolvers = mockSaveFileManual();
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('C1'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1); // C1 в полёте (медленный диск)

    // Пользователь печатает, пока C1 ещё пишется; второй таймер срабатывает
    // в полёте — параллельной записи быть не должно: если C2 завершится
    // первой, dirty сбросится, а затем C1 откатит диск к устаревшему контенту
    act(() => useAppStore.getState().setContent('C2'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1);

    // C1 завершился: записанное уже устарело → немедленная дописка C2
    await act(async () => {
      resolvers[0](true);
    });
    expect(saveFileCalls()).toHaveLength(2);
    expect(saveFileCalls()[0][1]).toEqual({ path: '/test.md', content: 'C1' });
    expect(saveFileCalls()[1][1]).toEqual({ path: '/test.md', content: 'C2' });
    // dirty жив до финальной записи — промежуточная его не сбрасывает
    expect(useAppStore.getState().isDirty).toBe(true);

    await act(async () => {
      resolvers[1](true);
    });
    expect(useAppStore.getState().isDirty).toBe(false);
    expect(saveFileCalls()).toHaveLength(2);
  });

  it('контент изменился во время записи: dirty не сбрасывается, актуальное дописывается сразу', async () => {
    const resolvers = mockSaveFileManual();
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('C1'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1);

    // Контент успел измениться, пока шла запись C1
    act(() => useAppStore.getState().setContent('C2'));
    await act(async () => {
      resolvers[0](true);
    });

    // Промежуточная запись НЕ сбросила dirty и актуальный контент
    // ушёл на диск без ожидания нового дебаунс-окна
    expect(saveFileCalls()).toHaveLength(2);
    expect(useAppStore.getState().isDirty).toBe(true);

    await act(async () => {
      resolvers[1](true);
    });
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it('ререндер хоста без изменения стора не даёт повторной записи и повторного тоста', async () => {
    mockSaveFile('fail');
    const { rerender } = renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('привет'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Любой ререндер App (Ctrl+F, смена темы/шрифта) — стор при этом не менялся
    rerender();
    rerender();
    await vi.advanceTimersByTimeAsync(5000);

    expect(saveFileCalls()).toHaveLength(1);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('ADV-C: ручной save в полёте автосейва — цикл дописывает актуальный контент после отката диска', async () => {
    const resolvers = mockSaveFileManual();
    renderHook(() => useAutosave());

    // Автосейв C1 ушёл на «медленный» диск
    act(() => useAppStore.getState().setContent('C1'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1); // летит C1

    // Пользователь допечатал C2; второй таймер срабатывает в полёте
    act(() => useAppStore.getState().setContent('C2'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1); // сериализация: параллельной записи нет

    // Ручной Ctrl+S — как useFile.save: тот же tauri.saveFile и БЕЗУСЛОВНЫЙ
    // setDirty(false) по завершении, вне сериализации автосейва
    act(() => {
      void (async () => {
        await tauri.saveFile('/test.md', useAppStore.getState().content);
        useAppStore.getState().setDirty(false);
      })();
    });
    expect(saveFileCalls()).toHaveLength(2); // ручная запись C2 в полёте

    // Ручная запись C2 завершается ПЕРВОЙ: dirty сброшен, диск = C2
    await act(async () => {
      resolvers[1](true);
    });
    expect(useAppStore.getState().isDirty).toBe(false);

    // Автосейв C1 завершается ПОСЛЕДНИМ: диск откатился к C1, но цикл
    // обязан это заметить (стор C2 ≠ записанному C1) и дописать C2,
    // несмотря на уже чистый dirty-флаг
    await act(async () => {
      resolvers[0](true);
    });
    expect(saveFileCalls()).toHaveLength(3);
    expect(saveFileCalls()[2][1]).toEqual({ path: '/test.md', content: 'C2' });

    // Залечивающая запись завершилась — диск догнал стор
    await act(async () => {
      resolvers[2](true);
    });
    expect(useAppStore.getState().isDirty).toBe(false);
    expect(saveFileCalls()).toHaveLength(3);
  });

  it('ADV-D: после ошибки ровно один ретрай на pending-флаг и один тост', async () => {
    // save_file «зависает», тест сам фейлит записи в нужном порядке
    const rejecters: Array<(e: Error) => void> = [];
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'save_file') {
        return new Promise<boolean>((_, reject) => rejecters.push(reject));
      }
      return Promise.resolve(true);
    });
    renderHook(() => useAutosave());

    act(() => useAppStore.getState().setContent('C1'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1); // летит C1

    // Правка C2, таймер срабатывает в полёте — выставлен pending
    act(() => useAppStore.getState().setContent('C2'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFileCalls()).toHaveLength(1);

    // C1 упал: тост один, finally видит pending и сразу (без дебаунса)
    // запускает ретрай актуального контента
    await act(async () => {
      rejecters[0](new Error('disk full'));
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(saveFileCalls()).toHaveLength(2);
    expect(saveFileCalls()[1][1]).toEqual({ path: '/test.md', content: 'C2' });

    // Ретрай тоже упал: тост НЕ дублируется, новых попыток без действий
    // пользователя нет
    await act(async () => {
      rejecters[1](new Error('disk full'));
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(saveFileCalls()).toHaveLength(2);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
