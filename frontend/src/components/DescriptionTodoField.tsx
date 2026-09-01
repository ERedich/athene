import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";

import { lucidePrimeBtnIcon } from "../icons/lucide";
import {
  MAX_TODO_ITEMS,
  MAX_TODO_TEXT_LENGTH,
  newTodoFormItem,
  type DescriptionViewMode,
  type TodoFormItem,
} from "../lib/todoTypes";

type Props = {
  descriptionLabel: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  descriptionMaxLength?: number;
  descriptionCounterKey?: string;
  todos: TodoFormItem[];
  onTodosChange: (items: TodoFormItem[]) => void;
  viewMode: DescriptionViewMode;
  onViewModeChange: (mode: DescriptionViewMode) => void;
  disabled?: boolean;
  textareaId?: string;
};

export function DescriptionTodoField({
  descriptionLabel,
  description,
  onDescriptionChange,
  descriptionMaxLength = 2000,
  descriptionCounterKey = "workOrders.descriptionCounter",
  todos,
  onTodosChange,
  viewMode,
  onViewModeChange,
  disabled = false,
  textareaId = "description-field",
}: Props) {
  const { t } = useTranslation();

  const addTodo = () => {
    if (todos.length >= MAX_TODO_ITEMS) return;
    onTodosChange([...todos, newTodoFormItem()]);
  };

  const updateTodo = (localId: string, text: string) => {
    onTodosChange(todos.map((item) => (item.localId === localId ? { ...item, text } : item)));
  };

  const removeTodo = (localId: string) => {
    onTodosChange(todos.filter((item) => item.localId !== localId));
  };

  const moveTodo = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= todos.length) return;
    const next = [...todos];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onTodosChange(next);
  };

  return (
    <div className="space-y-2 md:col-span-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={textareaId} className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {descriptionLabel}
        </label>
        <div
          className="app-segmented-control app-segmented-control--match-input"
          role="group"
          aria-label={t("workOrders.descriptionModeLegend")}
        >
          {(["text", "instructions"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`app-segmented-control__btn${
                viewMode === mode ? " app-segmented-control__btn--active" : ""
              }`}
              aria-pressed={viewMode === mode}
              disabled={disabled}
              onClick={() => onViewModeChange(mode)}
            >
              {t(`workOrders.descriptionMode.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "text" ? (
        <>
          <textarea
            id={textareaId}
            value={description}
            maxLength={descriptionMaxLength}
            disabled={disabled}
            onChange={(e) => onDescriptionChange(e.target.value)}
            className="w-full p-inputtext p-component min-h-28 resize-y"
          />
          <div className="text-xs text-on-surface-variant text-right">
            {t(descriptionCounterKey, { count: description.length, max: descriptionMaxLength })}
          </div>
        </>
      ) : (
        <div className="space-y-2 rounded-lg border border-outline-variant/40 p-3">
          {todos.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t("workOrders.instructionsEmpty")}</p>
          ) : (
            todos.map((item, index) => (
              <div key={item.localId} className="flex items-start gap-2">
                <InputText
                  value={item.text}
                  maxLength={MAX_TODO_TEXT_LENGTH}
                  disabled={disabled}
                  onChange={(e) => updateTodo(item.localId, e.target.value)}
                  className="w-full"
                  autoComplete="off"
                  placeholder={t("workOrders.instructionPlaceholder")}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    icon={<ArrowUp className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                    className="h-8 w-8 !p-0"
                    severity="secondary"
                    outlined
                    disabled={disabled || index === 0}
                    aria-label={t("workOrders.instructionMoveUp")}
                    onClick={() => moveTodo(index, -1)}
                  />
                  <Button
                    type="button"
                    icon={<ArrowDown className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                    className="h-8 w-8 !p-0"
                    severity="secondary"
                    outlined
                    disabled={disabled || index === todos.length - 1}
                    aria-label={t("workOrders.instructionMoveDown")}
                    onClick={() => moveTodo(index, 1)}
                  />
                  <Button
                    type="button"
                    icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                    className="h-8 w-8 !p-0"
                    severity="danger"
                    outlined
                    disabled={disabled}
                    aria-label={t("workOrders.instructionDelete")}
                    onClick={() => removeTodo(item.localId)}
                  />
                </div>
              </div>
            ))
          )}
          <Button
            type="button"
            label={t("workOrders.instructionAdd")}
            icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            severity="secondary"
            outlined
            disabled={disabled || todos.length >= MAX_TODO_ITEMS}
            onClick={addTodo}
          />
        </div>
      )}
    </div>
  );
}
