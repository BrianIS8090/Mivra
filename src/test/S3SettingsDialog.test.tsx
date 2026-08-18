import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3SettingsDialog } from '../components/S3Settings/S3SettingsDialog';
import { useAppStore } from '../stores/appStore';
import { useToastStore } from '../stores/toastStore';
import * as tauri from '../utils/tauri';
import type { S3Config } from '../bindings';

vi.mock('../utils/tauri', async () => {
  const actual = await vi.importActual<typeof import('../utils/tauri')>('../utils/tauri');
  return {
    ...actual,
    s3SetSecret: vi.fn(),
    s3ClearSecret: vi.fn(),
    s3SecretExists: vi.fn(),
    s3TestConnection: vi.fn(),
  };
});

// Валидный сохранённый конфиг: форма диалога инициализируется из стора
const VALID_CONFIG: S3Config = {
  endpoint: 'https://s3.test',
  region: 'ru-central1',
  bucket: 'bucket',
  access_key_id: 'key-id',
  public_url_prefix: null,
  path_prefix: null,
};

// Управляемый вручную промис для сценариев «тест в полёте»
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function toastMessages(): string[] {
  return useToastStore.getState().toasts.map((t) => t.message);
}

describe('S3SettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'ru', s3: VALID_CONFIG, s3Verified: false });
    useToastStore.setState({ toasts: [] });
    vi.mocked(tauri.s3SecretExists).mockResolvedValue(true);
    vi.mocked(tauri.s3TestConnection).mockResolvedValue(undefined);
    vi.mocked(tauri.s3SetSecret).mockResolvedValue(undefined);
  });

  it('тест с введённым секретом передаёт его напрямую и НЕ пишет в keyring', async () => {
    render(<S3SettingsDialog onClose={vi.fn()} />);
    await act(() => Promise.resolve());

    fireEvent.change(screen.getByLabelText('Access Key Secret'), {
      target: { value: 'typed-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));

    await waitFor(() => expect(tauri.s3TestConnection).toHaveBeenCalled());
    // Секрет уходит параметром в тест, а не в keyring
    expect(tauri.s3TestConnection).toHaveBeenCalledWith(VALID_CONFIG, 'typed-secret');
    expect(tauri.s3SetSecret).not.toHaveBeenCalled();
    expect(toastMessages()).toContain('Соединение работает');
  });

  it('тест без ввода секрета использует хранимый (secret=null)', async () => {
    render(<S3SettingsDialog onClose={vi.fn()} />);
    await act(() => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));

    await waitFor(() => expect(tauri.s3TestConnection).toHaveBeenCalled());
    expect(tauri.s3TestConnection).toHaveBeenCalledWith(VALID_CONFIG, null);
    expect(tauri.s3SetSecret).not.toHaveBeenCalled();
  });

  it('сохранение пишет введённый секрет в keyring и закрывает диалог', async () => {
    const onClose = vi.fn();
    render(<S3SettingsDialog onClose={onClose} />);
    await act(() => Promise.resolve());

    fireEvent.change(screen.getByLabelText('Access Key Secret'), {
      target: { value: 'typed-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tauri.s3SetSecret).toHaveBeenCalledWith('typed-secret');
    expect(useAppStore.getState().s3).toEqual(VALID_CONFIG);
    // Тест не запускался — verified не взводится
    expect(useAppStore.getState().s3Verified).toBe(false);
  });

  it('успешный тест + сохранение → s3Verified=true', async () => {
    const onClose = vi.fn();
    render(<S3SettingsDialog onClose={onClose} />);
    await act(() => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));
    await waitFor(() => expect(toastMessages()).toContain('Соединение работает'));

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useAppStore.getState().s3Verified).toBe(true);
  });

  it('гонка: изменение поля во время теста → testedOk не взводится', async () => {
    const d = deferred<void>();
    vi.mocked(tauri.s3TestConnection).mockReturnValue(d.promise);
    const onClose = vi.fn();
    render(<S3SettingsDialog onClose={onClose} />);
    await act(() => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));
    // Во время теста поля и кнопки заблокированы
    expect(screen.getByLabelText('Endpoint URL')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();

    // Программное изменение поля в полёте инвалидирует результат теста
    fireEvent.change(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'https://changed.test' },
    });
    await act(async () => {
      d.resolve();
    });

    // Тост успеха не показан: результат относился к старому снапшоту формы
    expect(toastMessages()).not.toContain('Соединение работает');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useAppStore.getState().s3Verified).toBe(false);
  });

  it('гонка: закрытие во время теста (успех) → без тоста и смены состояния', async () => {
    const d = deferred<void>();
    vi.mocked(tauri.s3TestConnection).mockReturnValue(d.promise);
    const { unmount } = render(<S3SettingsDialog onClose={vi.fn()} />);
    await act(() => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));
    unmount();
    await act(async () => {
      d.resolve();
    });

    expect(toastMessages()).toHaveLength(0);
    expect(useAppStore.getState().s3Verified).toBe(false);
  });

  it('гонка: закрытие во время теста (фейл) → verified не сбрасывается, тоста нет', async () => {
    useAppStore.setState({ s3Verified: true });
    const d = deferred<void>();
    vi.mocked(tauri.s3TestConnection).mockReturnValue(d.promise);
    const { unmount } = render(<S3SettingsDialog onClose={vi.fn()} />);
    await act(() => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));
    unmount();
    await act(async () => {
      d.reject('boom');
    });

    expect(toastMessages()).toHaveLength(0);
    expect(useAppStore.getState().s3Verified).toBe(true);
  });

  it('StrictMode: успешный тест соединения показывает тост и взводит testedOk', async () => {
    // StrictMode в dev прогоняет setup→cleanup→setup эффектов на том же инстансе:
    // guard размонтирования не должен остаться «выключенным» после этого.
    const onClose = vi.fn();
    render(
      <StrictMode>
        <S3SettingsDialog onClose={onClose} />
      </StrictMode>,
    );
    await act(() => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));
    await waitFor(() => expect(toastMessages()).toContain('Соединение работает'));

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useAppStore.getState().s3Verified).toBe(true);
  });

  it('гонка: завершившаяся очистка секрета инвалидирует летящий тест', async () => {
    const clearD = deferred<void>();
    const testD = deferred<void>();
    vi.mocked(tauri.s3ClearSecret).mockReturnValue(clearD.promise);
    vi.mocked(tauri.s3TestConnection).mockReturnValue(testD.promise);
    render(<S3SettingsDialog onClose={vi.fn()} />);
    await act(() => Promise.resolve());

    // Клик «Очистить» и мгновенный «Тест»: тест читает уже удаляемый секрет
    fireEvent.click(screen.getByRole('button', { name: 'Очистить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Тест соединения' }));

    // Очистка завершилась раньше теста → результат теста должен быть отброшен
    await act(async () => {
      clearD.resolve();
    });
    await act(async () => {
      testD.resolve();
    });

    expect(toastMessages()).not.toContain('Соединение работает');
  });
});
