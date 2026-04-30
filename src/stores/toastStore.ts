import { create } from 'zustand';

export type ToastType = 'loading' | 'success' | 'error' | 'info';
export type ToastId = string;

export interface Toast {
  id: ToastId;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type: ToastType) => ToastId;
  update: (id: ToastId, message: string, type?: ToastType) => void;
  dismiss: (id: ToastId) => void;
}

const MAX_TOASTS = 5;

let counter = 0;
function nextId(): ToastId {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type) => {
    const id = nextId();
    set((state) => {
      const next = [...state.toasts, { id, message, type }];
      // Кепка: при превышении вытесняем старейшие
      const trimmed = next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      return { toasts: trimmed };
    });
    return id;
  },
  update: (id, message, type) =>
    set((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, message, type: type ?? t.type } : t)),
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
