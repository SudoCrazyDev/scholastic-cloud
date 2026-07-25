// Per-institution color theming.
//
// The app's brand/semantic colors are exposed to Tailwind as CSS-variable-backed
// color scales in index.css (`@theme` block: --color-primary-*, --color-success-*,
// etc.). Those variables default to the standard Tailwind ramps, so an institution
// with no custom theme looks exactly as before.
//
// When an institution sets a theme, it stores ONE base hex per slot. At runtime we
// generate a full 50–950 ramp from that hex (in OKLCH, for perceptually even steps)
// and write the shades as inline custom properties on <html>, overriding the
// defaults. Clearing the overrides restores the defaults.

/** Themeable color slots. Neutral/gray is intentionally NOT themeable yet. */
export const THEME_SLOTS = ['primary', 'success', 'warning', 'danger', 'info'] as const;
export type ThemeSlot = (typeof THEME_SLOTS)[number];

/** One base hex per slot; every field optional so partial themes are valid. */
export type InstitutionTheme = Partial<Record<ThemeSlot, string>>;

/**
 * Representative default hex per slot (mirrors the Tailwind ramp used in
 * index.css). Shown as the starting value in the settings picker and used when
 * resetting a slot to default.
 */
export const DEFAULT_THEME: Record<ThemeSlot, string> = {
  primary: '#4f46e5', // primary-600
  success: '#059669', // emerald-600
  warning: '#d97706', // amber-600
  danger: '#dc2626', // red-600
  info: '#2563eb', // blue-600
};

/** Tailwind shade stops we generate for each slot. */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];

// Per-shade target lightness (OKLCH L, 0–1) and chroma factor (relative to the
// base color's chroma). Lightness is fixed per stop so a "600" of any hue reads
// as roughly the same darkness — keeping white-on-color contrast predictable.
const RAMP: Record<Shade, { l: number; c: number }> = {
  50: { l: 0.972, c: 0.12 },
  100: { l: 0.94, c: 0.25 },
  200: { l: 0.89, c: 0.45 },
  300: { l: 0.82, c: 0.68 },
  400: { l: 0.73, c: 0.9 },
  500: { l: 0.64, c: 1.0 },
  600: { l: 0.56, c: 1.0 },
  700: { l: 0.48, c: 0.92 },
  800: { l: 0.41, c: 0.8 },
  900: { l: 0.35, c: 0.68 },
  950: { l: 0.26, c: 0.5 },
};

// ---- Color space conversions (sRGB <-> OKLCH), per Björn Ottosson ----

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

interface Oklch {
  l: number;
  c: number;
  h: number;
}

function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = srgbToLinear(rgb[0] / 255);
  const g = srgbToLinear(rgb[1] / 255);
  const b = srgbToLinear(rgb[2] / 255);

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  return { l: L, c: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

function oklchToHex({ l: L, c: C, h }: Oklch): string {
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  return rgbToHex(linearToSrgb(r) * 255, linearToSrgb(g) * 255, linearToSrgb(bl) * 255);
}

/**
 * Generate a Tailwind-style 50–950 ramp from a single base hex. The base color's
 * hue and chroma are preserved; per-shade lightness is fixed and chroma scales by
 * the ramp factor so the steps read evenly. Returns null for an invalid hex.
 */
export function generateRamp(baseHex: string): Record<Shade, string> | null {
  const base = hexToOklch(baseHex);
  if (!base) return null;
  const out = {} as Record<Shade, string>;
  for (const shade of SHADES) {
    const { l, c } = RAMP[shade];
    out[shade] = oklchToHex({ l, c: base.c * c, h: base.h });
  }
  return out;
}

/** True when `hex` is a valid #RRGGBB string. */
export function isValidHex(hex: string): boolean {
  return hexToRgb(hex) !== null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => srgbToLinear(c / 255));
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG contrast ratio (1–21) between two hex colors. Returns 1 for bad input. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Contrast of white text on this slot's primary button shade (600). Below ~4.5
 * white button labels get hard to read, so the settings UI warns. Returns null
 * for an invalid hex.
 */
export function whiteTextContrastOn600(baseHex: string): number | null {
  const ramp = generateRamp(baseHex);
  return ramp ? contrastRatio(ramp[600], '#ffffff') : null;
}

/**
 * Apply an institution theme by writing generated ramp shades as inline custom
 * properties (`--color-<slot>-<shade>`) on the root element. Any slot omitted (or
 * with an invalid hex) is cleared, falling back to the default defined in
 * index.css. Passing null/undefined clears every slot.
 */
export function applyTheme(theme: InstitutionTheme | null | undefined, root: HTMLElement = document.documentElement): void {
  for (const slot of THEME_SLOTS) {
    const base = theme?.[slot];
    const ramp = base ? generateRamp(base) : null;
    for (const shade of SHADES) {
      const prop = `--color-${slot}-${shade}`;
      if (ramp) {
        root.style.setProperty(prop, ramp[shade]);
      } else {
        root.style.removeProperty(prop);
      }
    }
  }
}

/** Remove all institution theme overrides, restoring the index.css defaults. */
export function clearTheme(root: HTMLElement = document.documentElement): void {
  applyTheme(null, root);
}
