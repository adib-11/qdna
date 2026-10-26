/**
 * WCAG 2.x colour contrast, for colours the page computes at runtime rather
 * than takes from a token (the genome map's cell shades). Colours are
 * six-digit hex, `#rrggbb`.
 */

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

function format(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance, as WCAG defines it. */
function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** `color` at `alpha` opacity laid over an opaque `background`. */
export function mixOver(color: string, alpha: number, background: string): string {
  const fg = parse(color);
  const bg = parse(background);
  return format(fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb);
}

/** Black or white, whichever reads better on `background`. */
export function readableInk(background: string): string {
  return contrastRatio("#000000", background) >= contrastRatio("#ffffff", background)
    ? "#000000"
    : "#ffffff";
}
