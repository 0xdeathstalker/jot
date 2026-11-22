import { TaskItem as BaseTaskItem, inputRegex } from "@tiptap/extension-list"
import type { Node as PMNode } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { InputRule } from "@tiptap/react"

// Raycast Notes style: `- [ ] ` gives a checklist item, not a bullet with a checkbox inside.
// `- ` has already made a bullet by the time `[ ] ` is typed, so when the match sits at the start of
// a bullet item, swap that one item for a checklist item: the bullet list is split around it.
// Elsewhere the handler returns null and TaskItem's own rule (`[] `, `[ ] `, `[x] `) runs.
// (ProseMirror's liftListItem / wrapInList cannot be used here: they refuse a transaction that
// already holds the deletion of the typed `[ ] `.)
export const TaskItem = BaseTaskItem.extend({
  addInputRules() {
    const fromBullet = new InputRule({
      find: inputRegex,
      handler: ({ state, range, match }) => {
        const $from = state.doc.resolve(range.from)
        const atBulletStart =
          $from.depth >= 3 &&
          $from.parentOffset === 0 &&
          $from.index(-1) === 0 &&
          $from.node(-1).type.name === "listItem" &&
          $from.node(-2).type.name === "bulletList"
        if (!atBulletStart) return null

        const { nodes } = state.schema
        const listPos = $from.before(-2)
        const index = $from.index(-2)
        const tr = state.tr.delete(range.from, range.to) // positions before range.from are unchanged
        const list = tr.doc.nodeAt(listPos)
        if (!list) return null

        const items: PMNode[] = []
        list.forEach((item) => items.push(item))
        const before = items.slice(0, index)
        const after = items.slice(index + 1)
        const task = nodes.taskItem.create(
          { checked: match[match.length - 1] === "x" },
          items[index].content,
        )
        const replacement = [
          ...(before.length ? [list.type.create(list.attrs, before)] : []),
          nodes.taskList.create(null, task),
          ...(after.length ? [list.type.create(list.attrs, after)] : []),
        ]
        tr.replaceWith(listPos, listPos + list.nodeSize, replacement)

        // Cursor at the start of the new item's text: past the leading list, then into
        // taskList > taskItem > paragraph.
        const start = listPos + (before.length ? replacement[0].nodeSize : 0) + 3
        tr.setSelection(TextSelection.create(tr.doc, start))
      },
    })
    return [fromBullet, ...(this.parent?.() ?? [])]
  },
})
