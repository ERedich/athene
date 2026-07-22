import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Button } from "primereact/button";

import { useStammdatenCounts } from "../hooks/useStammdatenCounts";
import { STAMMDATEN_MANAGER_TILES } from "../lib/stammdatenManagerTiles";

function formatCount(count: number | null, locale: string): string {
  if (count === null) return "—";
  try {
    return new Intl.NumberFormat(locale).format(count);
  } catch {
    return String(count);
  }
}

export function StammdatenManagerPage() {
  const { t, i18n } = useTranslation();
  const { counts, loading, error, refetch } = useStammdatenCounts();

  if (error && !loading) {
    return (
      <div className="app-stammdaten-manager-page app-stammdaten-manager-page--message min-h-0 flex-1 overflow-auto">
        <div className="m-4 rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">
          <p>{t("stammdatenManager.loadError")}</p>
          <Button
            type="button"
            label={t("stammdatenManager.retry")}
            size="small"
            className="mt-3"
            onClick={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-stammdaten-manager-page min-h-0 flex-1 overflow-auto">
      <div className="app-stammdaten-manager-grid" role="list">
        {STAMMDATEN_MANAGER_TILES.map((tile, index) => {
          const { Icon } = tile;
          const count = counts[tile.countKey];
          return (
            <NavLink
              key={tile.id}
              to={tile.to}
              role="listitem"
              className="app-stammdaten-manager-tile app-card-cascade"
              style={{ ["--app-cascade-index" as string]: index }}
            >
              <span className="app-stammdaten-manager-tile-icon" aria-hidden>
                <Icon size={28} strokeWidth={1.75} />
              </span>
              <span className="app-stammdaten-manager-tile-title">{t(tile.labelKey)}</span>
              <span className="app-stammdaten-manager-tile-value" aria-live="polite">
                {loading && count === null ? "…" : formatCount(count, i18n.language)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
