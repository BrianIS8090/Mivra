import { useEffect } from 'react';
import { getTranslations } from '../../i18n';
import type { Language } from '../../i18n';
import './dialog.css';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

interface Props {
  language: Language;
  onChoice: (choice: UnsavedChoice) => void;
}

export function UnsavedChangesDialog({ language, onChoice }: Props) {
  const t = getTranslations(language);

  // Esc — отмена; клик по подложке — тоже отмена
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onChoice('cancel');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onChoice]);

  return (
    <div className="dialog-overlay" onClick={() => onChoice('cancel')}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="unsaved-dialog-title" className="dialog-title">{t.unsavedTitle}</h2>
        <p className="dialog-message">{t.unsavedMessage}</p>
        <div className="dialog-actions">
          <button
            className="dialog-btn dialog-btn-primary"
            onClick={() => onChoice('save')}
            autoFocus
          >
            {t.save}
          </button>
          <button className="dialog-btn" onClick={() => onChoice('discard')}>
            {t.discard}
          </button>
          <button className="dialog-btn dialog-btn-ghost" onClick={() => onChoice('cancel')}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
