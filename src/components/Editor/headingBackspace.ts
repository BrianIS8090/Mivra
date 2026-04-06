import type { EditorState, Transaction } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

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

  const previousNode = container.child(blockIndex - 1);
  if (previousNode.type.name !== 'paragraph' || previousNode.content.size !== 0) {
    return null;
  }

  const currentBlockPos = $from.before(blockDepth);
  const deleteFrom = currentBlockPos - previousNode.nodeSize;
  const deleteTo = currentBlockPos;

  const tr = state.tr.delete(deleteFrom, deleteTo);
  tr.setSelection(TextSelection.create(tr.doc, deleteFrom + 1));
  return tr.scrollIntoView();
}
