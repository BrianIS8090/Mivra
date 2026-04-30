import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from '../stores/toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('show добавляет toast и возвращает id', () => {
    const id = useToastStore.getState().show('Загружаю', 'loading');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].message).toBe('Загружаю');
    expect(toasts[0].type).toBe('loading');
  });

  it('update меняет существующий toast по id', () => {
    const id = useToastStore.getState().show('Загружаю', 'loading');
    useToastStore.getState().update(id, 'Готово', 'success');
    const t = useToastStore.getState().toasts[0];
    expect(t.message).toBe('Готово');
    expect(t.type).toBe('success');
  });

  it('dismiss удаляет toast', () => {
    const id = useToastStore.getState().show('msg', 'info');
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('show ограничен max=5 одновременных', () => {
    const store = useToastStore.getState();
    for (let i = 0; i < 7; i++) store.show(`t${i}`, 'info');
    expect(useToastStore.getState().toasts).toHaveLength(5);
    // Старейшие удалены
    expect(useToastStore.getState().toasts[0].message).toBe('t2');
  });
});
