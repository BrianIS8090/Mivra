import { useToastStore } from '../stores/toastStore';

export function useToast() {
  return {
    show: useToastStore((s) => s.show),
    update: useToastStore((s) => s.update),
    dismiss: useToastStore((s) => s.dismiss),
  };
}
