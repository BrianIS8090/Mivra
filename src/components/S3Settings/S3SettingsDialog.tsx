import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getTranslations } from '../../i18n';
import * as tauri from '../../utils/tauri';
import type { S3Config } from '../../bindings';
import { useToast } from '../../hooks/useToast';
import './s3-settings.css';

interface Props {
  onClose: () => void;
}

// Пустая конфигурация по умолчанию для новой формы
const EMPTY_CONFIG: S3Config = {
  endpoint: '',
  region: '',
  bucket: '',
  access_key_id: '',
  public_url_prefix: null,
  path_prefix: null,
};

export function S3SettingsDialog({ onClose }: Props) {
  const language = useAppStore((s) => s.language);
  const currentS3 = useAppStore((s) => s.s3);
  const setS3Config = useAppStore((s) => s.setS3Config);
  const setS3Verified = useAppStore((s) => s.setS3Verified);
  const t = getTranslations(language);
  const toast = useToast();

  const [form, setForm] = useState<S3Config>(currentS3 ?? EMPTY_CONFIG);
  const [secretInput, setSecretInput] = useState('');
  const [secretExists, setSecretExists] = useState(false);
  const [testing, setTesting] = useState(false);
  // testedOk: пользователь нажал «Тест соединения» в этой сессии диалога и тест прошёл.
  // При сохранении мы переносим этот флаг в глобальный s3Verified, который зажигает
  // зелёную подсветку кнопки S3 в Toolbar. Любое изменение поля сбрасывает флаг.
  const [testedOk, setTestedOk] = useState(false);

  // Защита от гонок «Тест соединения»:
  // mountedRef — диалог ещё смонтирован (позднее завершение после закрытия
  // не должно менять глобальное состояние и показывать тосты);
  // testGenRef — поколение запущенного теста: любое изменение поля или новый
  // запуск инвалидирует результат предыдущего (снапшот-семантика).
  const mountedRef = useRef(true);
  const testGenRef = useRef(0);

  // Setup перевзводит mountedRef: StrictMode в dev прогоняет
  // setup→cleanup→setup на том же инстансе ref'а, и без этого guard
  // остался бы «выключенным» навсегда (тест молча перестал бы работать).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Проверяем при монтировании, есть ли уже сохранённый secret в keyring
  useEffect(() => {
    tauri.s3SecretExists().then(setSecretExists).catch(() => setSecretExists(false));
  }, []);

  // Esc закрывает диалог.
  // Координация слоёв (F1): Esc, уже обработанный другим слоем, игнорируем;
  // свой Esc помечаем preventDefault — см. комментарий в UnsavedChangesDialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Универсальный обработчик полей формы (опциональные поля → null при пустой строке).
  // При любом изменении поля сбрасываем testedOk — старый тест больше не релевантен,
  // и инвалидируем летящий тест (поколение++) — его результат не применится.
  const handleField =
    (key: keyof S3Config) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      testGenRef.current += 1;
      setForm((prev) => ({
        ...prev,
        [key]:
          key === 'public_url_prefix' || key === 'path_prefix' ? (value || null) : value,
      }));
      setTestedOk(false);
    };

  const handleClearSecret = async () => {
    try {
      await tauri.s3ClearSecret();
      // Инвалидируем летящий тест: он мог тестировать уже удалённый секрет.
      // Инкремент именно после await — тест, запущенный вслед за кликом
      // «Очистить» (пока удаление в полёте), тоже будет отброшен.
      testGenRef.current += 1;
      setSecretExists(false);
      setTestedOk(false);
      setS3Verified(false);
      toast.show(t.s3SecretClear, 'success');
    } catch (e) {
      toast.show(`${e}`, 'error');
    }
  };

  const handleSecretChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    testGenRef.current += 1;
    setSecretInput(e.target.value);
    setTestedOk(false);
  };

  const handleTest = async () => {
    // Поколение этого запуска: если за время await форма изменилась (поле,
    // секрет) — результат не применяем, он относится к устаревшему снапшоту.
    const gen = ++testGenRef.current;
    setTesting(true);
    try {
      // Введённый секрет передаём напрямую в тест, БЕЗ записи в keyring.
      // Запись в keyring — только по «Сохранить» (handleSave).
      // Пустое поле → null → Rust возьмёт ранее сохранённый секрет из keyring.
      await tauri.s3TestConnection(form, secretInput || null);
      if (!mountedRef.current || testGenRef.current !== gen) return;
      setTestedOk(true);
      toast.show(t.s3TestSuccess, 'success');
    } catch (e) {
      if (!mountedRef.current || testGenRef.current !== gen) return;
      setTestedOk(false);
      setS3Verified(false);
      toast.show(`${t.s3TestFail}: ${e}`, 'error');
    } finally {
      if (mountedRef.current) setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      if (secretInput) {
        await tauri.s3SetSecret(secretInput);
      }
      // Минимальная валидация — endpoint/region/bucket/access_key_id обязательны
      if (!form.endpoint || !form.region || !form.bucket || !form.access_key_id) {
        toast.show('Заполните обязательные поля', 'error');
        return;
      }
      setS3Config(form);
      // testedOk → s3Verified: зелёная подсветка только если в этой сессии прошёл
      // успешный «Тест соединения». Если пользователь не тестировал — флаг false,
      // кнопка будет нейтральной (даже если конфиг идентичен предыдущему).
      setS3Verified(testedOk);
      toast.show('Настройки сохранены', 'success');
      onClose();
    } catch (e) {
      toast.show(`${e}`, 'error');
    }
  };

  return (
    <div className="s3-overlay" onClick={onClose}>
      <div
        className="s3-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="s3-title">{t.s3DialogTitle}</h2>

        <label className="s3-field">
          <span>{t.s3Endpoint}</span>
          <input
            type="text"
            value={form.endpoint}
            onChange={handleField('endpoint')}
            disabled={testing}
            placeholder={t.s3EndpointHint}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3Region}</span>
          <input
            type="text"
            value={form.region}
            onChange={handleField('region')}
            disabled={testing}
            placeholder={t.s3RegionHint}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3Bucket}</span>
          <input
            type="text"
            value={form.bucket}
            onChange={handleField('bucket')}
            disabled={testing}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3AccessKeyId}</span>
          <input
            type="text"
            value={form.access_key_id}
            onChange={handleField('access_key_id')}
            disabled={testing}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3AccessKeySecret}</span>
          <div className="s3-secret-row">
            <input
              type="password"
              value={secretInput}
              onChange={handleSecretChange}
              disabled={testing}
              placeholder={secretExists ? t.s3SecretSaved : ''}
            />
            {secretExists && (
              <button
                type="button"
                className="s3-btn s3-btn-ghost"
                onClick={handleClearSecret}
                disabled={testing}
              >
                {t.s3SecretClear}
              </button>
            )}
          </div>
        </label>

        <label className="s3-field">
          <span>{t.s3PublicUrlPrefix}</span>
          <input
            type="text"
            value={form.public_url_prefix ?? ''}
            onChange={handleField('public_url_prefix')}
            disabled={testing}
            placeholder={t.s3PublicUrlPrefixHint}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3PathPrefix}</span>
          <input
            type="text"
            value={form.path_prefix ?? ''}
            onChange={handleField('path_prefix')}
            disabled={testing}
            placeholder={t.s3PathPrefixHint}
          />
        </label>

        <div className="s3-actions">
          <button
            type="button"
            className="s3-btn s3-btn-ghost"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? '...' : t.s3TestConnection}
          </button>
          <button
            type="button"
            className="s3-btn s3-btn-primary"
            onClick={handleSave}
            disabled={testing}
          >
            {t.s3SaveSettings}
          </button>
          <button type="button" className="s3-btn" onClick={onClose}>
            {t.s3CancelSettings}
          </button>
        </div>
      </div>
    </div>
  );
}
