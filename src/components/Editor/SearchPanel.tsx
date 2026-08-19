import { useCallback, useEffect, useRef, useState } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useAppStore } from '../../stores/appStore';
import { getTranslations } from '../../i18n';
import { useEditorHandle } from './EditorContext';
import {
  findMatches,
  findMatchesInDoc,
  findNearestIndex,
  nextMatchIndex,
  prevMatchIndex,
  replaceAllMatchesInText,
  replaceMatchInText,
  searchHighlightPluginKey,
  EMPTY_SEARCH_HIGHLIGHT,
  type SearchMatch,
} from './editorSearch';
import './searchPanel.css';

interface SearchPanelProps {
  // Ctrl+H открывает панель сразу с развёрнутой строкой замены
  showReplace: boolean;
  // Сигнал-счётчик из App: инкрементируется при каждом Ctrl+F/Ctrl+H.
  // По его изменению панель возвращает фокус в поле запроса и синхронизирует
  // строку замены — так работают повторные шорткаты на уже открытой панели.
  focusSignal: number;
  onClose: () => void;
}

// Панель поиска и замены (Ctrl+F / Ctrl+H). Живёт в App поверх редактора,
// редактор получает через EditorContext: visual — ProseMirror-документ
// с подсветкой декорациями, source — поиск по значению textarea.
// Известное ограничение source-режима: подсветки всех совпадений в textarea
// нет (невозможно без overlay-слоя), работает только выделение текущего.
export function SearchPanel({ showReplace, focusSignal, onClose }: SearchPanelProps) {
  const handleRef = useEditorHandle();
  const language = useAppStore((s) => s.language);
  const editorMode = useAppStore((s) => s.editorMode);
  // Подписка на content: после пересоздания Crepe / ввода в документ
  // панель обязана пересчитать совпадения.
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const t = getTranslations(language);

  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceVisible, setReplaceVisible] = useState(showReplace);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [current, setCurrent] = useState(-1);

  const queryInputRef = useRef<HTMLInputElement>(null);
  // Зеркала state для отложенных пересчётов (таймеры в эффектах).
  const currentRef = useRef(-1);
  // Якорь навигации: позиция, от которой выбирается «ближайшее» совпадение.
  const caretAnchorRef = useRef(0);
  // Якорь инициализируется лениво от текущей каретки при первом поиске —
  // к этому моменту редактор точно смонтирован и выставил выделение.
  const anchorReadyRef = useRef(false);

  const withView = useCallback(<T,>(fn: (view: EditorView) => T): T | null => {
    const editor = handleRef.current.editor;
    if (!editor) return null;
    try {
      return editor.action((ctx) => fn(ctx.get(editorViewCtx)));
    } catch {
      // Редактор уже уничтожен (destroy очищает контейнер контекстов Milkdown)
      // или ещё не создан — для панели это состояние «редактора нет».
      return null;
    }
  }, [handleRef]);

  // null = редактор ещё не готов (Crepe пересоздаётся) — эффект повторит попытку.
  const computeMatches = useCallback((): SearchMatch[] | null => {
    if (!query) return [];
    if (editorMode === 'visual') {
      if (!handleRef.current.editor) return null;
      return withView((view) => findMatchesInDoc(view.state.doc, query, caseSensitive));
    }
    const ta = handleRef.current.sourceTextarea;
    if (!ta) return null;
    return findMatches(ta.value, query, caseSensitive);
  }, [editorMode, query, caseSensitive, handleRef, withView]);

  // Текущая каретка редактора — стартовый якорь навигации при открытии панели.
  const readCaretAnchor = useCallback((): number | null => {
    if (editorMode === 'visual') {
      return withView((view) => view.state.selection.from);
    }
    const ta = handleRef.current.sourceTextarea;
    return ta ? ta.selectionStart : null;
  }, [editorMode, handleRef, withView]);

  const applyHighlights = useCallback((found: SearchMatch[], currentIndex: number) => {
    if (editorMode !== 'visual') return;
    withView((view) => {
      view.dispatch(
        view.state.tr.setMeta(searchHighlightPluginKey, { matches: found, current: currentIndex }),
      );
    });
  }, [editorMode, withView]);

  // Переход к совпадению. focusEditor=true — явная навигация (Enter/кнопки).
  const jumpTo = useCallback((match: SearchMatch, focusEditor: boolean) => {
    caretAnchorRef.current = match.from;
    if (editorMode === 'visual') {
      withView((view) => {
        const selection = TextSelection.create(view.state.doc, match.from, match.to);
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
      });
      return;
    }
    const ta = handleRef.current.sourceTextarea;
    if (!ta) return;
    if (focusEditor) {
      // Фокус на textarea нужен, чтобы WebView прокрутил текст к выделению;
      // сразу возвращаем фокус в поле поиска, чтобы не ломать ввод запроса.
      ta.focus();
      ta.setSelectionRange(match.from, match.to);
      queryInputRef.current?.focus();
    } else {
      ta.setSelectionRange(match.from, match.to);
    }
  }, [editorMode, handleRef, withView]);

  const applyResult = useCallback((found: SearchMatch[], jump: boolean) => {
    let index: number;
    if (jump || currentRef.current < 0) {
      index = findNearestIndex(found, caretAnchorRef.current);
    } else {
      index = currentRef.current < found.length ? currentRef.current : found.length - 1;
    }
    currentRef.current = index;
    setMatches(found);
    setCurrent(index);
    applyHighlights(found, index);
    if (jump && index >= 0) jumpTo(found[index], false);
  }, [applyHighlights, jumpTo]);

  // Пересчёт совпадений. Изменение запроса/регистра — синхронно и с переходом
  // к ближайшему совпадению; изменение контента/режима — отложенно на тик
  // (source-textarea синхронизируется эффектом Editor после записи в store)
  // и без переноса выделения, чтобы не дёргать курсор у редактирующего.
  const prevSearchRef = useRef({ query: '', caseSensitive: false });
  useEffect(() => {
    const searchChanged =
      prevSearchRef.current.query !== query || prevSearchRef.current.caseSensitive !== caseSensitive;
    prevSearchRef.current = { query, caseSensitive };

    // Первый поиск после открытия панели стартует от текущей каретки
    // (visual: selection.from, source: textarea.selectionStart), а не от
    // начала документа.
    if (searchChanged && !anchorReadyRef.current) {
      anchorReadyRef.current = true;
      const caret = readCaretAnchor();
      if (caret !== null) caretAnchorRef.current = caret;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = (attempt: number) => {
      if (cancelled) return;
      const found = computeMatches();
      if (found === null) {
        // Редактор ещё пересоздаётся — повторяем с ограничением попыток.
        if (attempt < 40) timer = setTimeout(() => run(attempt + 1), 50);
        return;
      }
      applyResult(found, searchChanged);
    };

    if (searchChanged) {
      run(0);
    } else {
      timer = setTimeout(() => run(0), 0);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [query, caseSensitive, content, editorMode, computeMatches, applyResult, readCaretAnchor]);

  // Esc закрывает панель независимо от того, где фокус.
  // Координация слоёв: диалоги и меню-бар (document-listeners) срабатывают
  // раньше window-listener'а панели и помечают свой Esc через preventDefault —
  // тогда панель не реагирует. Свой Esc панель тоже помечает, чтобы
  // нижележащие слои не закрывались следом. Поэтому при одновременно
  // открытых меню и панели первый Esc закроет только меню (его слой гасит
  // событие на document-уровне), второй Esc — панель.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      onClose();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // При закрытии панели снимаем подсветку с документа.
  useEffect(() => () => {
    withView((view) => {
      view.dispatch(view.state.tr.setMeta(searchHighlightPluginKey, EMPTY_SEARCH_HIGHLIGHT));
    });
  }, [withView]);

  // Открытие панели и повторные Ctrl+F/Ctrl+H на уже открытой панели:
  // синхронизируем строку замены с запрошенным режимом и возвращаем
  // фокус в поле запроса.
  useEffect(() => {
    setReplaceVisible(showReplace);
    queryInputRef.current?.focus();
  }, [focusSignal, showReplace]);

  const goTo = (index: number) => {
    if (index < 0 || index >= matches.length) return;
    currentRef.current = index;
    setCurrent(index);
    applyHighlights(matches, index);
    jumpTo(matches[index], true);
  };
  const goNext = () => goTo(nextMatchIndex(matches.length, current));
  const goPrev = () => goTo(prevMatchIndex(matches.length, current));

  const replaceCurrent = () => {
    const match = matches[current];
    if (!match) return;
    if (editorMode === 'visual') {
      // Обязательно помечаем взаимодействие: иначе markdownUpdated в Editor.tsx
      // отфильтрует программное изменение и замена не попадёт в store.
      handleRef.current.markUserInteracted();
      withView((view) => {
        view.dispatch(view.state.tr.insertText(replacement, match.from, match.to));
      });
    } else {
      const ta = handleRef.current.sourceTextarea;
      if (!ta) return;
      setContent(replaceMatchInText(ta.value, match, replacement));
    }
    // Якорь на конец вставленной замены + сброс текущего индекса: пересчёт
    // выберет ближайшее совпадение ЗА пределами замены, иначе при замене,
    // содержащей запрос, текущее застревало бы внутри вставленного текста
    // и каждая замена раздувала документ.
    caretAnchorRef.current = match.from + replacement.length;
    currentRef.current = -1;
  };

  const replaceAll = () => {
    if (matches.length === 0) return;
    if (editorMode === 'visual') {
      handleRef.current.markUserInteracted();
      withView((view) => {
        const tr = view.state.tr;
        // Одна транзакция, замены в обратном порядке смещений — позиции
        // ранних замен не сдвигают поздние.
        for (let i = matches.length - 1; i >= 0; i--) {
          tr.insertText(replacement, matches[i].from, matches[i].to);
        }
        view.dispatch(tr);
      });
    } else {
      const ta = handleRef.current.sourceTextarea;
      if (!ta) return;
      setContent(replaceAllMatchesInText(ta.value, matches, replacement));
    }
    // Как и после замены текущего: пересчёт выбирает совпадение от якоря,
    // а не сохранённый индекс (позиции после массовой замены съехали).
    currentRef.current = -1;
  };

  const onQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.shiftKey) goPrev();
    else goNext();
  };

  const onReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    replaceCurrent();
  };

  return (
    <div className="search-panel">
      <div className="search-panel-row">
        <button
          type="button"
          className={`search-panel-btn${replaceVisible ? ' active' : ''}`}
          onClick={() => setReplaceVisible((v) => !v)}
          title={t.toggleReplaceTooltip}
          aria-label={t.toggleReplaceTooltip}
        >
          {replaceVisible ? '⌄' : '›'}
        </button>
        <input
          ref={queryInputRef}
          className="search-panel-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onQueryKeyDown}
          placeholder={t.findPlaceholder}
          autoFocus
        />
        <button
          type="button"
          className={`search-panel-btn${caseSensitive ? ' active' : ''}`}
          onClick={() => setCaseSensitive((v) => !v)}
          title={t.matchCaseTooltip}
          aria-label={t.matchCaseTooltip}
        >
          Aa
        </button>
        <span className="search-panel-counter" aria-live="polite">
          {query !== '' && (matches.length > 0 ? `${current + 1}/${matches.length}` : t.noMatches)}
        </span>
        <button
          type="button"
          className="search-panel-btn"
          onClick={goPrev}
          disabled={matches.length === 0}
          title={t.findPrevTooltip}
          aria-label={t.findPrevTooltip}
        >
          ↑
        </button>
        <button
          type="button"
          className="search-panel-btn"
          onClick={goNext}
          disabled={matches.length === 0}
          title={t.findNextTooltip}
          aria-label={t.findNextTooltip}
        >
          ↓
        </button>
        <button
          type="button"
          className="search-panel-btn"
          onClick={onClose}
          title={t.searchCloseTooltip}
          aria-label={t.searchCloseTooltip}
        >
          ✕
        </button>
      </div>
      {replaceVisible && (
        <div className="search-panel-row">
          <span className="search-panel-toggle-spacer" />
          <input
            className="search-panel-input"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onReplaceKeyDown}
            placeholder={t.replacePlaceholder}
          />
          <button
            type="button"
            className="search-panel-btn"
            onClick={replaceCurrent}
            disabled={matches.length === 0}
            title={t.replaceTooltip}
            aria-label={t.replaceTooltip}
          >
            ⇨
          </button>
          <button
            type="button"
            className="search-panel-btn"
            onClick={replaceAll}
            disabled={matches.length === 0}
            title={t.replaceAllTooltip}
            aria-label={t.replaceAllTooltip}
          >
            ⇉
          </button>
        </div>
      )}
    </div>
  );
}
