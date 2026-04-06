import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

function isEmptyHtmlBreak(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '<br />' || normalized === '<br>' || normalized === '<br/>' || normalized === '<br >';
}

function isWhitespaceTextNode(node: ProseMirrorNode): boolean {
  return node.isText && node.text?.trim() === '';
}

function isVisualBreakNode(node: ProseMirrorNode): boolean {
  if (node.type.name === 'hardbreak') return true;
  if (node.type.name === 'html') return isEmptyHtmlBreak(node.attrs.value);
  return false;
}

function isVisuallyEmptyParagraph(state: EditorState, nodeIndex: number, parentDepth: number): boolean {
  const node = state.selection.$from.node(parentDepth).child(nodeIndex);
  if (node.type.name !== 'paragraph') return false;
  if (node.childCount === 0) return true;

  return node.content.content.every((child) => {
    if (isVisualBreakNode(child)) return true;
    if (!child.isText) return false;
    return isWhitespaceTextNode(child);
  });
}

function getTrailingVisualBreakRange(
  state: EditorState,
  nodeIndex: number,
  parentDepth: number,
  blockStartPos: number,
): { from: number; to: number } | null {
  const node = state.selection.$from.node(parentDepth).child(nodeIndex);
  if (node.type.name !== 'paragraph' || node.childCount === 0) return null;

  let trailingWhitespaceSize = 0;
  let trailingIndex = node.childCount - 1;

  while (trailingIndex >= 0 && isWhitespaceTextNode(node.child(trailingIndex))) {
    trailingWhitespaceSize += node.child(trailingIndex).nodeSize;
    trailingIndex -= 1;
  }

  if (trailingIndex < 0) return null;

  const trailingNode = node.child(trailingIndex);
  if (!isVisualBreakNode(trailingNode)) return null;

  let hasMeaningfulContentBefore = false;
  for (let index = 0; index < trailingIndex; index += 1) {
    const child = node.child(index);
    if (isWhitespaceTextNode(child) || isVisualBreakNode(child)) continue;
    hasMeaningfulContentBefore = true;
    break;
  }

  if (!hasMeaningfulContentBefore) return null;

  const contentStartPos = blockStartPos + 1;
  let childOffset = 0;
  for (let index = 0; index < trailingIndex; index += 1) {
    childOffset += node.child(index).nodeSize;
  }

  const from = contentStartPos + childOffset;
  const to = from + trailingNode.nodeSize + trailingWhitespaceSize;
  return { from, to };
}

export function createHeadingBackspaceTransaction(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if ($from.depth === 0 || $from.parent.type.name !== 'heading' || $from.parentOffset !== 0) {
    return null;
  }

  const blockDepth = $from.depth;
  const containerDepth = blockDepth - 1;
  const container = $from.node(containerDepth);
  const blockIndex = $from.index(containerDepth);
  if (blockIndex === 0) return null;

  const previousBlockStartPos = $from.before(blockDepth) - container.child(blockIndex - 1).nodeSize;

  if (isVisuallyEmptyParagraph(state, blockIndex - 1, containerDepth)) {
    const previousNode = container.child(blockIndex - 1);
    const currentBlockPos = $from.before(blockDepth);
    const deleteFrom = currentBlockPos - previousNode.nodeSize;
    const deleteTo = currentBlockPos;

    const tr = state.tr.delete(deleteFrom, deleteTo);
    tr.setSelection(TextSelection.create(tr.doc, deleteFrom + 1));
    return tr.scrollIntoView();
  }

  const currentBlockPos = $from.before(blockDepth);
  const trailingBreakRange = getTrailingVisualBreakRange(
    state,
    blockIndex - 1,
    containerDepth,
    previousBlockStartPos,
  );
  if (!trailingBreakRange) return null;

  const deleteSize = trailingBreakRange.to - trailingBreakRange.from;
  const tr = state.tr.delete(trailingBreakRange.from, trailingBreakRange.to);
  tr.setSelection(TextSelection.create(tr.doc, currentBlockPos - deleteSize + 1));
  return tr.scrollIntoView();
}
