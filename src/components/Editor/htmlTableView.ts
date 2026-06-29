import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import type { NodeViewConstructor } from '@milkdown/prose/view';
import { htmlSchema } from '@milkdown/kit/preset/commonmark';
import { $view } from '@milkdown/kit/utils';

const TABLE_TAGS = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
]);

const NUMERIC_ATTRS = new Set(['colspan', 'rowspan']);
const TEXT_ATTRS = new Set(['align', 'scope']);

function copySafeAttributes(source: Element, target: HTMLElement): void {
  for (const attr of Array.from(source.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim();

    if (NUMERIC_ATTRS.has(name)) {
      const num = Number.parseInt(value, 10);
      if (Number.isFinite(num) && num > 0 && num <= 100) {
        target.setAttribute(name, String(num));
      }
      continue;
    }

    if (TEXT_ATTRS.has(name) && /^[\w -]{1,32}$/u.test(value)) {
      target.setAttribute(name, value);
    }
  }
}

function sanitizeTableNode(source: ChildNode, doc: Document): ChildNode | null {
  if (source.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(source.textContent ?? '');
  }

  if (!(source instanceof Element)) return null;

  const tag = source.tagName.toLowerCase();
  if (!TABLE_TAGS.has(tag)) {
    return doc.createTextNode(source.textContent ?? '');
  }

  const target = doc.createElement(tag);
  copySafeAttributes(source, target);

  source.childNodes.forEach((child) => {
    const safeChild = sanitizeTableNode(child, doc);
    if (safeChild) target.append(safeChild);
  });

  return target;
}

function findSingleTable(doc: Document): HTMLTableElement | null {
  const meaningfulChildren = Array.from(doc.body.childNodes).filter((node) => (
    node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())
  ));
  if (meaningfulChildren.length !== 1) return null;

  const [child] = meaningfulChildren;
  if (!(child instanceof HTMLTableElement)) return null;
  return child;
}

export function createSafeHtmlTableElement(value: string): HTMLTableElement | null {
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  const table = findSingleTable(parsed);
  if (!table) return null;

  const safeTable = sanitizeTableNode(table, document);
  if (!(safeTable instanceof HTMLTableElement)) return null;
  return safeTable;
}

function renderHtmlValue(dom: HTMLElement, value: string): void {
  dom.textContent = '';
  const table = createSafeHtmlTableElement(value);

  if (table) {
    dom.classList.add('mivra-html-table-view');
    dom.append(table);
    return;
  }

  dom.classList.remove('mivra-html-table-view');
  dom.textContent = value;
}

export const htmlTableView = $view(
  htmlSchema.node,
  (): NodeViewConstructor => {
    return (node: ProseMirrorNode) => {
      const dom = document.createElement('span');
      dom.setAttribute('data-type', 'html');
      dom.setAttribute('data-value', node.attrs.value);
      dom.contentEditable = 'false';
      renderHtmlValue(dom, node.attrs.value);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          dom.setAttribute('data-value', updatedNode.attrs.value);
          renderHtmlValue(dom, updatedNode.attrs.value);
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },
);
