import { useEffect, useState } from 'react';
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

  // Проверяем при монтировании, есть ли уже сохранённый secret в keyring
  useEffect(() => {
    tauri.s3SecretExists().then(setSecretExists).catch(() => setSecretExists(false));
  }, []);

  // Esc закрывает диалог
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Универсальный обработчик полей формы (опциональные поля → null при пустой строке).
  // При любом изменении поля сбрасываем testedOk — старый тест больше не релевантен.
  const handleField =
    (key: keyof S3Config) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
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
      setSecretExists(false);
      setTestedOk(false);
      toast.show(t.s3SecretClear, 'success');
    } catch (e) {
      toast.show(`${e}`, 'error');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      // Если в форме введён новый secret — сначала сохраняем его временно
      if (secretInput) {
        await tauri.s3SetSecret(secretInput);
        setSecretExists(true);
      }
      await tauri.s3TestConnection(form);
      setTestedOk(true);
      toast.show(t.s3TestSuccess, 'success');
    } catch (e) {
      setTestedOk(false);
      toast.show(`${t.s3TestFail}: ${e}`, 'error');
    } finally {
      setTesting(false);
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
            placeholder={t.s3EndpointHint}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3Region}</span>
          <input
            type="text"
            value={form.region}
            onChange={handleField('region')}
            placeholder={t.s3RegionHint}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3Bucket}</span>
          <input type="text" value={form.bucket} onChange={handleField('bucket')} />
        </label>

        <label className="s3-field">
          <span>{t.s3AccessKeyId}</span>
          <input
            type="text"
            value={form.access_key_id}
            onChange={handleField('access_key_id')}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3AccessKeySecret}</span>
          <div className="s3-secret-row">
            <input
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder={secretExists ? t.s3SecretSaved : ''}
            />
            {secretExists && (
              <button
                type="button"
                className="s3-btn s3-btn-ghost"
                onClick={handleClearSecret}
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
            placeholder={t.s3PublicUrlPrefixHint}
          />
        </label>

        <label className="s3-field">
          <span>{t.s3PathPrefix}</span>
          <input
            type="text"
            value={form.path_prefix ?? ''}
            onChange={handleField('path_prefix')}
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
          <button type="button" className="s3-btn s3-btn-primary" onClick={handleSave}>
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
