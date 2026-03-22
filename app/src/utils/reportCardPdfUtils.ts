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
