import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';

import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { confirmUnsavedChanges } from '../utils/dialogs';

// Перехватывает закрытие окна и при isDirty=true показывает prompt.
// Подписка устанавливается один раз и живёт всё время жизни приложения.
export function useExit() {
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    win.onCloseRequested(async (event) => {
      const { isDirty, language } = useAppStore.getState();
      if (!isDirty) return; // обычное закрытие

      event.preventDefault();
      const choice = await confirmUnsavedChanges(language);
      if (choice === 'cancel') return;

      if (choice === 'save') {
        const { filePath, content } = useAppStore.getState();
        try {
          if (filePath) {
            await tauri.saveFile(filePath, content);
          } else {
            const path = await tauri.saveFileAs(content);
            if (!path) return; // пользователь отменил saveAs — окно остаётся
          }
        } catch (e) {
          console.error('[useExit] save failed:', e);
          return;
        }
      }

      useAppStore.getState().setDirty(false);
      await win.destroy();
    }).then((u) => {
      if (cancelled) {
        u();
      } else {
        unlisten = u;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
