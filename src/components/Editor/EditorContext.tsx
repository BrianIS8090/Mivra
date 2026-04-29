import { createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode, MutableRefObject } from 'react';
import type { Editor } from '@milkdown/kit/core';

// Хэндл редактора для доступа к API без перерендеров.
// Хранится через ref — обновление полей не вызывает ре-рендер потребителей.
export interface EditorHandle {
  editor: Editor | null;
  sourceTextarea: HTMLTextAreaElement | null;
}

interface EditorContextValue {
  handleRef: MutableRefObject<EditorHandle>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const handleRef = useRef<EditorHandle>({ editor: null, sourceTextarea: null });
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
