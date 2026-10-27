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

/**
 * A CSS `oklch(L% C H)` colour as sRGB hex, so a token in app/tokens.css can be
 * checked for contrast. Out-of-gamut channels are clipped, as browsers do.
 */
export function oklchToHex(css: string): string {
  const [l, c, h] = css.match(/[\d.]+/g)!.map(Number);
  const L = l / 100;
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  // OKLab to linear sRGB (Björn Ottosson's matrices).
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return format(linear.map((x) => Math.min(1, Math.max(0, gamma(x))) * 255) as Rgb);
}
