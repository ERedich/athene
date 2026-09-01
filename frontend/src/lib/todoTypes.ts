export type DescriptionViewMode = "text" | "instructions";

export type TodoFormItem = {
  localId: string;
  text: string;
};

export type TodoRecord = {
  id: string;
  pos: number;
  text: string;
  checked?: boolean;
  checkedAt?: string | null;
  checkedBy?: string | null;
  checkedByLoginName?: string | null;
};

export const MAX_TODO_ITEMS = 50;
export const MAX_TODO_TEXT_LENGTH = 500;

export function newTodoFormItem(text = ""): TodoFormItem {
  return {
    localId: globalThis.crypto?.randomUUID?.() ?? `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
  };
}

export function todosFromRecords(records: TodoRecord[] | undefined | null): TodoFormItem[] {
  return (records ?? []).map((record) => ({ localId: record.id, text: record.text }));
}

export function todosToPayload(items: TodoFormItem[]): { text: string }[] {
  return items
    .map((item) => item.text.trim())
    .filter(Boolean)
    .slice(0, MAX_TODO_ITEMS)
    .map((text) => ({ text }));
}

export function defaultDescriptionView(
  todos: TodoFormItem[],
  preferred?: DescriptionViewMode,
): DescriptionViewMode {
  if (preferred) return preferred;
  return todos.some((item) => item.text.trim()) ? "instructions" : "text";
}
