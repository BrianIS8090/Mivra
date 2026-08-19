import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedChangesDialog } from '../components/Dialog/UnsavedChangesDialog';

// Координация Esc между слоями UI (фикс-раунд F1): диалог — верхний слой
// (document-listener), панель поиска — нижний (window-listener). Диалог обязан
// помечать обработанный Esc через preventDefault и игнорировать уже
// обработанные события.
describe('UnsavedChangesDialog: координация Esc', () => {
  it('Esc закрывает диалог отменой и помечает событие обработанным', () => {
    const onChoice = vi.fn();
    render(<UnsavedChangesDialog language="ru" onChoice={onChoice} />);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(onChoice).toHaveBeenCalledWith('cancel');
    expect(event.defaultPrevented).toBe(true);
  });

  it('Esc, уже обработанный другим слоем (defaultPrevented), диалог игнорирует', () => {
    const onChoice = vi.fn();
    render(<UnsavedChangesDialog language="ru" onChoice={onChoice} />);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(document, event);

    expect(onChoice).not.toHaveBeenCalled();
  });
});
