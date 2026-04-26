/** Default matches DB migration default for `site.colorHex`. */
export const DEFAULT_SITE_COLOR_HEX = "#64748b";

function parseHexColor(colorHex?: string): [number, number, number] {
  const raw = (colorHex || DEFAULT_SITE_COLOR_HEX).trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  const match = /^#([0-9a-fA-F]{6})$/.exec(withHash);
  if (!match) return [100, 116, 139];
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function mixWithWhite(colorHex: string | undefined, amount: number): string {
  const [r, g, b] = parseHexColor(colorHex);
  const mix = (channel: number) => Math.round(channel * (1 - amount) + 255 * amount);
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Text color for site labels (derived from `colorHex`, lightened for contrast on surfaces). */
export function readableSiteColor(colorHex?: string): string {
  return mixWithWhite(colorHex, 0.3);
}
