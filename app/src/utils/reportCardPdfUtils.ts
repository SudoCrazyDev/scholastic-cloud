/**
 * Shrink font size so a single line of Helvetica-like report card text fits within maxWidthPt.
 * Uses a conservative average character width so long names stay on one line instead of wrapping.
 */
export function fitPdfSingleLineFontSizePx(
  text: string,
  maxWidthPt: number,
  maxFontPx: number,
  minFontPx = 4.5
): number {
  const t = String(text || '').trim();
  if (!t) return maxFontPx;
  const avgCharWidthFactor = 0.54;
  const raw = maxWidthPt / (t.length * avgCharWidthFactor);
  const rounded = Math.round(raw * 10) / 10;
  return Math.max(minFontPx, Math.min(maxFontPx, rounded));
}

/** Usable width (pt) for Principal/Teacher lines: half of A5 landscape column minus padding, then half of row. */
export const REPORT_CARD_SIGNATURE_HALF_MAX_PT = 118;

/**
 * Report card student line: Last Name, First Name Ext. Name Middle Initial.
 * (Extension/suffix after first name; middle initial last.)
 */
export function formatStudentNameReportCard(student: {
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  ext_name?: string | null;
} | null | undefined): string {
  if (!student) return '';
  const last = String(student.last_name ?? '').trim();
  const first = String(student.first_name ?? '').trim();
  const ext = String(student.ext_name ?? '').trim();
  const middle = String(student.middle_name ?? '').trim();
  const mi = middle ? `${middle.charAt(0)}.` : '';
  const tail = [first, ext, mi].filter(Boolean).join(' ');
  if (!last && !tail) return '';
  if (!last) return tail;
  if (!tail) return last;
  return `${last}, ${tail}`;
}

/**
 * Shrink a multi-line block of text until it fits a fixed box.
 *
 * A single-line fit (above) divides by length; a block has to account for
 * wrapping, so this estimates how many lines the text takes at a candidate
 * size and steps down until they fit the height available.
 *
 * This is the second of three defences against a narrative that overflows its
 * DepEd box, and it exists because the other two are not enough on their own.
 * The first is the cap at entry, which a form written before the cap existed
 * escapes. The third is a continuation page, which is correct but which nobody
 * wants for the sake of one extra sentence. So: fit it if it can be fitted
 * legibly, and let the caller spill only what genuinely cannot.
 *
 * `minFontPx` is a legibility floor, not a suggestion — below about 6pt a
 * printed report card stops being readable by the parent it is for, and
 * shrinking further to avoid a page break is the wrong trade. The caller is
 * expected to check whether the text still fits at the returned size.
 */
export function fitPdfBlockFontSizePx(
  text: string,
  maxWidthPt: number,
  maxHeightPt: number,
  maxFontPx: number,
  minFontPx = 6
): number {
  const t = String(text || '').trim();
  if (!t) return maxFontPx;

  for (let size = maxFontPx; size >= minFontPx; size -= 0.25) {
    if (estimatePdfBlockHeightPt(t, maxWidthPt, size) <= maxHeightPt) {
      return Math.round(size * 100) / 100;
    }
  }

  return minFontPx;
}

/**
 * Roughly how tall a wrapped block runs, in points.
 *
 * Helvetica at 0.5em average advance is a deliberate slight over-estimate:
 * guessing high costs a smaller font, guessing low costs text sliced off the
 * bottom of a printed form. Explicit newlines are counted as their own lines,
 * because a teacher's paragraph breaks are real.
 */
export function estimatePdfBlockHeightPt(
  text: string,
  maxWidthPt: number,
  fontSizePt: number,
  lineHeight = 1.3
): number {
  const charsPerLine = Math.max(1, Math.floor(maxWidthPt / (fontSizePt * 0.5)));

  const lines = String(text || '')
    .split(/\r?\n/)
    .reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.length / charsPerLine)), 0);

  return lines * fontSizePt * lineHeight;
}
