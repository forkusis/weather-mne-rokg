export function fmtNum(
  value: number | null | undefined,
  digits = 0,
  suffix = "",
): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("sr-ME", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** ZHMS wind direction code → rough text (16-point style codes vary). */
export function windDirText(code: number | null | undefined): string {
  if (code === null || code === undefined) return "";
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  // codes on source often 0–36 step or 1–8; keep simple
  if (code >= 0 && code <= 15) return dirs[code] ?? "";
  if (code >= 1 && code <= 36) return dirs[Math.round(((code % 36) / 36) * 16) % 16] ?? "";
  return "";
}
