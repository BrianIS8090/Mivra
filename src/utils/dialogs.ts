import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { UnsavedChangesDialog, type UnsavedChoice } from '../components/Dialog/UnsavedChangesDialog';
import type { Language } from '../i18n';

export type { UnsavedChoice };

// Императивно показывает модальный диалог о несохранённых изменениях.
// Создаёт отдельное React-дерево в body, ждёт выбор пользователя,
// затем размонтирует и резолвит Promise.
export function confirmUnsavedChanges(language: Language): Promise<UnsavedChoice> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleChoice = (choice: UnsavedChoice) => {
      // Размонтирование откладываем на следующий микротаск,
      // чтобы избежать "unmount during render" при auto-focus
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
      resolve(choice);
    };

    root.render(createElement(UnsavedChangesDialog, { language, onChoice: handleChoice }));
  });
}
