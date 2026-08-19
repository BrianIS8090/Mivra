import { createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode, MutableRefObject } from 'react';
import type { Editor } from '@milkdown/kit/core';

// Хэндл редактора для доступа к API без перерендеров.
// Хранится через ref — обновление полей не вызывает ре-рендер потребителей.
export interface EditorHandle {
  editor: Editor | null;
  sourceTextarea: HTMLTextAreaElement | null;
  // Пометить документ как отредактированный пользователем. Нужно программным
  // заменам (панель поиска): без этого markdownUpdated в Editor.tsx
  // отфильтрует изменение гейтом userInteractedRef и оно не попадёт в store.
  markUserInteracted: () => void;
}

interface EditorContextValue {
  handleRef: MutableRefObject<EditorHandle>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  // no-op по умолчанию: реальную реализацию присваивает Editor.tsx при монтировании
  const noop = () => {};
  const handleRef = useRef<EditorHandle>({ editor: null, sourceTextarea: null, markUserInteracted: noop });
  const value = useMemo(() => ({ handleRef }), []);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorHandle(): MutableRefObject<EditorHandle> {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error('useEditorHandle должен использоваться внутри <EditorProvider>');
  }
  return ctx.handleRef;
}
