import type { Editor } from '@milkdown/kit/core';
import { strikethroughKeymap } from '@milkdown/kit/preset/gfm';

// GFM-пресет Milkdown биндит Mod-Alt-x на toggleStrikethrough. Это конфликтует
// с задокументированным шорткатом приложения Ctrl+Alt+X (вставка чекбокса —
// см. App.tsx и справку): keymap редактора перехватывает событие и ставит
// preventDefault, поэтому глобальный хендлер App его игнорирует.
// Снимаем биндинг на уровне конфига keymap: пустой массив shortcuts отключает
// регистрацию (см. $useKeymap в @milkdown/utils — биндинги читаются из этого
// среза при сборке keymap после выполнения config-колбэков).
// Strikethrough остаётся доступен: Ctrl+Shift+X обрабатывается в App.tsx,
// плюс кнопка в тулбаре Crepe вызывает команду напрямую.
export function removeConflictingStrikethroughKeymap(editor: Editor): void {
  editor.config((ctx) => {
    ctx.update(strikethroughKeymap.ctx.key, (keymap) => ({
      ...keymap,
      ToggleStrikethrough: { ...keymap.ToggleStrikethrough, shortcuts: [] },
    }));
  });
}
