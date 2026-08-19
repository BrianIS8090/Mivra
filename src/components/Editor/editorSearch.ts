// Ядро поиска и замены по документу (F1).
// Первая половина файла — чистые текстовые функции без DOM и ProseMirror,
// полностью покрытые юнит-тестами. Вторая — склейка с ProseMirror:
// поиск по документу и плагин подсветки совпадений.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

// Полуоткрытый диапазон [from, to): для чистого текста — смещения в строке,
// для ProseMirror — позиции в документе.
export interface SearchMatch {
  from: number;
  to: number;
}

// Все непересекающиеся вхождения query в text. Поиск литеральный (indexOf),
// поэтому спецсимволы regex не требуют экранирования.
export function findMatches(text: string, query: string, caseSensitive: boolean): SearchMatch[] {
  if (!query) return [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: SearchMatch[] = [];
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    matches.push({ from, to: from + needle.length });
    // Шаг на длину совпадения — пересекающиеся вхождения не считаем,
    // как в большинстве редакторов («aa» в «aaa» → одно совпадение).
    from = haystack.indexOf(needle, from + needle.length);
  }
  return matches;
}

// Навигация с wrap-around. current < 0 трактуем как «ещё не выбрано».
export function nextMatchIndex(length: number, current: number): number {
  if (length <= 0) return -1;
  if (current < 0) return 0;
  return (current + 1) % length;
}

export function prevMatchIndex(length: number, current: number): number {
  if (length <= 0) return -1;
  if (current < 0) return length - 1;
  return (current - 1 + length) % length;
}

// Индекс первого совпадения, начинающегося не раньше pos; если такого нет —
// первое совпадение (wrap-around). Пустой список → -1.
export function findNearestIndex(matches: SearchMatch[], pos: number): number {
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].from >= pos) return i;
  }
  return matches.length > 0 ? 0 : -1;
}

export function replaceMatchInText(text: string, match: SearchMatch, replacement: string): string {
  return text.slice(0, match.from) + replacement + text.slice(match.to);
}

// Замена всех совпадений за один проход — в обратном порядке смещений,
// чтобы ранние замены не сдвигали позиции поздних.
export function replaceAllMatchesInText(
  text: string,
  matches: SearchMatch[],
  replacement: string,
): string {
  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    result = replaceMatchInText(result, matches[i], replacement);
  }
  return result;
}

// --- Склейка с ProseMirror ---

// Сегмент текста внутри textblock'а: непрерывный кусок текстового узла
// и его позиция в документе.
interface TextSegment {
  textFrom: number;
  pmFrom: number;
  length: number;
}

// Собирает текст блока из его текстовых узлов. Нетекстовые inline-узлы
// (hardbreak, image) текста не дают — совпадения «через» них не ищем.
function collectBlockSegments(
  blockPos: number,
  block: ProseMirrorNode,
): { text: string; segments: TextSegment[] } {
  let text = '';
  const segments: TextSegment[] = [];
  const contentStart = blockPos + 1;
  block.forEach((child, offset) => {
    if (!child.isText || !child.text) return;
    segments.push({ textFrom: text.length, pmFrom: contentStart + offset, length: child.text.length });
    text += child.text;
  });
  return { text, segments };
}

// Переводит смещение в собранном тексте блока в позицию ProseMirror.
// Смещение на стыке сегментов (между ними может стоять hardbreak/image) —
// одновременно «конец предыдущего» и «начало следующего» сегмента, а это
// РАЗНЫЕ PM-позиции. Поэтому для левой границы (edge='from') берём последний
// подходящий сегмент (позиция после разрыва), для правой (edge='to') —
// первый (позиция до разрыва). Иначе insertText(from, to) при замене
// совпадения после разрыва заденет и удалит сам узел-разрыв.
function mapSegmentOffset(
  segments: TextSegment[],
  offset: number,
  edge: 'from' | 'to',
): number | null {
  if (edge === 'from') {
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (offset >= seg.textFrom && offset <= seg.textFrom + seg.length) {
        return seg.pmFrom + (offset - seg.textFrom);
      }
    }
    return null;
  }
  for (const seg of segments) {
    if (offset >= seg.textFrom && offset <= seg.textFrom + seg.length) {
      return seg.pmFrom + (offset - seg.textFrom);
    }
  }
  return null;
}

// Поиск по ProseMirror-документу. Идём по textblock'ам через descendants,
// потому что doc.textBetween вставляет '\n' на границах блоков и ломал бы
// маппинг смещений в позиции.
// Известное ограничение: совпадения внутри code_block считаются и заменяются,
// но НЕ подсвечиваются — Crepe рендерит code_block nodeview'ом CodeMirror
// без contentDOM, inline-декорации ProseMirror туда не доходят.
export function findMatchesInDoc(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): SearchMatch[] {
  if (!query) return [];
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const { text, segments } = collectBlockSegments(pos, node);
    for (const m of findMatches(text, query, caseSensitive)) {
      const from = mapSegmentOffset(segments, m.from, 'from');
      const to = mapSegmentOffset(segments, m.to, 'to');
      if (from !== null && to !== null && from < to) {
        matches.push({ from, to });
      }
    }
    return false; // внутрь textblock'а не спускаемся — уже обработали
  });
  return matches;
}

// --- Плагин подсветки совпадений ---

export interface SearchHighlightState {
  matches: SearchMatch[];
  current: number;
}

export const EMPTY_SEARCH_HIGHLIGHT: SearchHighlightState = { matches: [], current: -1 };

export const searchHighlightPluginKey = new PluginKey<SearchHighlightState>('mivra-search-highlight');

// Плагин хранит список совпадений в meta транзакций (панель шлёт их через
// tr.setMeta) и рисует inline-декорации: .search-match для всех совпадений,
// .search-match-current для текущего. Между пересчётами панели позиции
// поддерживаются маппингом через изменения документа.
export function createSearchHighlightPlugin(): Plugin {
  return new Plugin<SearchHighlightState>({
    key: searchHighlightPluginKey,
    state: {
      init: () => EMPTY_SEARCH_HIGHLIGHT,
      apply: (tr, value) => {
        const meta = tr.getMeta(searchHighlightPluginKey) as SearchHighlightState | undefined;
        if (meta) return meta;
        if (!tr.docChanged || value.matches.length === 0) return value;
        const matches = value.matches
          .map((m) => ({ from: tr.mapping.map(m.from), to: tr.mapping.map(m.to) }))
          .filter((m) => m.from < m.to && m.to <= tr.doc.content.size);
        return { matches, current: value.current < matches.length ? value.current : -1 };
      },
    },
    props: {
      decorations(state) {
        const value = searchHighlightPluginKey.getState(state);
        if (!value || value.matches.length === 0) return null;
        const decorations = value.matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class: i === value.current ? 'search-match search-match-current' : 'search-match',
          }),
        );
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
