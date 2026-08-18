// Предикат для глобального keydown-хендлера App: решает, должен ли App
// обрабатывать событие клавиатуры или оно принадлежит элементу, в котором
// произошло (поле ввода диалога, keymap редактора и т.п.).

// Обертка редактора из Editor.tsx: внутри неё живут visual-редактор Crepe
// (.editor-root) и source-textarea (.editor-source). Поля ввода редактора
// продолжают получать шорткаты, все остальные поля ввода — нет.
const EDITOR_CONTAINER_SELECTOR = '.editor-container';

export function shouldHandleGlobalShortcut(e: KeyboardEvent): boolean {
  // Событие уже обработано ниже по дереву. Например, keymap ProseMirror/Milkdown
  // ставит preventDefault на Ctrl+B/Ctrl+I, но не stopPropagation — без этой
  // проверки App применял бы форматирование повторно и отменял эффект.
  if (e.defaultPrevented) return false;

  const target = e.target;
  // Не-элемент (window, document, null) — обрабатываем как обычно.
  if (!(target instanceof HTMLElement)) return true;

  const isFormField =
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;

  // Ближайший contenteditable-предок (или сам элемент) определяет
  // редактируемость. Проверка по атрибуту, а не по isContentEditable:
  // последний не реализован в jsdom.
  const editableHost = target.closest('[contenteditable]');
  const isContentEditable =
    editableHost !== null
    && editableHost.getAttribute('contenteditable') !== 'false';

  // Не поле ввода и не редактируемая область — обрабатываем.
  if (!isFormField && !isContentEditable) return true;

  // Поле ввода внутри редактора (source-textarea, contenteditable Crepe)
  // разрешаем; поля диалогов и тулбара — игнорируем, чтобы шорткаты
  // не мутировали документ за модальным окном.
  return target.closest(EDITOR_CONTAINER_SELECTOR) !== null;
}
