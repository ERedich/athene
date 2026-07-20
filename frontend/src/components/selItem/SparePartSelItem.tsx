import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Button } from "primereact/button";

import { useAuth } from "../../auth/AuthContext";
import { lucidePrimeBtnIcon } from "../../icons/lucide";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../lib/appParameterKeys";
import {
  lookupSparePartByKey,
  suggestSpareParts,
  type SparePartLookupResult,
} from "../../lib/sparePartLookupApi";
import { SparePartSelectionDrawer } from "./SparePartSelectionDrawer";

const SUGGEST_DEBOUNCE_MS = 250;
const SUGGEST_MIN_CHARS = 2;

export type SparePartSelItemProps = {
  inputId?: string;
  /** Selected spare part id (UUID), empty when none / invalid. */
  sparePartId: string;
  /** Display key in the input (controlled). */
  sparePartKey: string;
  onSelect: (sparePart: SparePartLookupResult | null) => void;
  onSparePartKeyChange: (key: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** When true, parent can force invalid styling (e.g. required on save). */
  forceInvalid?: boolean;
  /** When set, only spare parts belonging to this site are accepted (lookup + drawer). */
  siteId?: string;
};

/**
 * Spare part selection: AutoComplete suggestions (debounced) + blur exact lookup + picker drawer.
 */
export function SparePartSelItem({
  inputId,
  sparePartId,
  sparePartKey,
  onSelect,
  onSparePartKeyChange,
  disabled = false,
  placeholder,
  className,
  forceInvalid = false,
  siteId,
}: SparePartSelItemProps) {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];

  const [invalid, setInvalid] = useState(false);
  const [validating, setValidating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SparePartLookupResult[]>([]);

  const sparePartIdRef = useRef(sparePartId);
  sparePartIdRef.current = sparePartId;
  const validateSeq = useRef(0);
  const suggestTimerRef = useRef<number | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (suggestTimerRef.current != null) window.clearTimeout(suggestTimerRef.current);
      suggestAbortRef.current?.abort();
    };
  }, []);

  const acceptSparePart = useCallback(
    (sparePart: SparePartLookupResult) => {
      if (siteFieldLocked && sparePart.siteId !== user.workingSiteId) {
        setInvalid(true);
        onSelect(null);
        return false;
      }
      if (siteId && sparePart.siteId !== siteId) {
        setInvalid(true);
        onSelect(null);
        return false;
      }
      setInvalid(false);
      setSuggestions([]);
      onSparePartKeyChange(sparePart.key);
      onSelect(sparePart);
      return true;
    },
    [onSelect, onSparePartKeyChange, siteFieldLocked, siteId, user.workingSiteId],
  );

  const validateKey = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const seq = ++validateSeq.current;
      if (!trimmed) {
        setInvalid(false);
        if (sparePartIdRef.current) onSelect(null);
        onSparePartKeyChange("");
        return;
      }
      setValidating(true);
      try {
        const sparePart = await lookupSparePartByKey(trimmed);
        if (seq !== validateSeq.current) return;
        if (!sparePart) {
          setInvalid(true);
          onSelect(null);
          onSparePartKeyChange(trimmed);
          return;
        }
        acceptSparePart(sparePart);
      } catch {
        if (seq !== validateSeq.current) return;
        setInvalid(true);
        onSelect(null);
        onSparePartKeyChange(trimmed);
      } finally {
        if (seq === validateSeq.current) setValidating(false);
      }
    },
    [acceptSparePart, onSelect, onSparePartKeyChange],
  );

  const runSuggest = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < SUGGEST_MIN_CHARS) {
        setSuggestions([]);
        return;
      }

      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;

      try {
        const rows = await suggestSpareParts(trimmed, {
          siteId,
          signal: controller.signal,
          limit: 25,
        });
        if (controller.signal.aborted) return;
        setSuggestions(rows);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
      }
    },
    [siteId],
  );

  const onComplete = useCallback(
    (event: AutoCompleteCompleteEvent) => {
      const query = event.query ?? "";
      if (suggestTimerRef.current != null) window.clearTimeout(suggestTimerRef.current);
      if (query.trim().length < SUGGEST_MIN_CHARS) {
        suggestAbortRef.current?.abort();
        setSuggestions([]);
        return;
      }
      suggestTimerRef.current = window.setTimeout(() => {
        void runSuggest(query);
      }, SUGGEST_DEBOUNCE_MS);
    },
    [runSuggest],
  );

  const onInputBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      void validateKey(e.target.value);
    },
    [validateKey],
  );

  const itemTemplate = useCallback(
    (item: SparePartLookupResult) => (
      <div className="flex flex-col gap-0.5 py-0.5">
        <span className="font-medium text-on-surface">{item.key}</span>
        <span className="text-xs text-on-surface-variant">{item.name || t("selItem.sparePart.unnamed")}</span>
      </div>
    ),
    [t],
  );

  return (
    <>
      <div className={["p-inputgroup app-sel-item", className].filter(Boolean).join(" ")}>
        <AutoComplete
          inputId={inputId}
          value={sparePartKey}
          suggestions={suggestions}
          completeMethod={onComplete}
          delay={0}
          minLength={SUGGEST_MIN_CHARS}
          dropdown={false}
          forceSelection={false}
          disabled={disabled || validating}
          placeholder={placeholder ?? t("selItem.sparePart.suggestPlaceholder")}
          className="app-sel-item-autocomplete min-w-0 flex-1"
          inputClassName={invalid || forceInvalid ? "p-invalid" : undefined}
          panelClassName="app-sel-item-autocomplete-panel"
          itemTemplate={itemTemplate}
          emptyMessage={t("selItem.sparePart.noSuggestions")}
          onChange={(e) => {
            const next = e.value;
            if (typeof next === "string") {
              setInvalid(false);
              onSparePartKeyChange(next);
              if (sparePartIdRef.current) onSelect(null);
              return;
            }
            if (next && typeof next === "object" && "key" in next) {
              acceptSparePart(next as SparePartLookupResult);
            }
          }}
          onSelect={(e) => {
            const next = e.value;
            if (next && typeof next === "object" && "id" in next) {
              acceptSparePart(next as SparePartLookupResult);
            }
          }}
          onBlur={onInputBlur}
        />
        <Button
          type="button"
          icon={<Search className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />}
          disabled={disabled || validating}
          aria-label={t("selItem.sparePart.openPicker")}
          title={t("selItem.sparePart.openPicker")}
          onClick={() => setDrawerOpen(true)}
        />
      </div>
      <SparePartSelectionDrawer
        visible={drawerOpen}
        onHide={() => setDrawerOpen(false)}
        siteId={siteId}
        onSelect={(sparePart) => {
          acceptSparePart(sparePart);
        }}
      />
    </>
  );
}
