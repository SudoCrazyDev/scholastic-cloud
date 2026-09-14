import type { MatatagDescriptor } from '../../../types'

/**
 * Reading a block of descriptors off the clipboard.
 *
 * The teachers this module is for have been keeping these marks in DepEd's
 * own workbook, and the first thing they will try is copying a column out of
 * it. Retyping ninety-one competencies by hand because the grid would not take
 * a paste is the kind of friction that decides whether a school adopts the
 * screen at all.
 *
 * Every spreadsheet — Excel, Sheets, LibreOffice — puts plain TSV on the
 * clipboard: cells separated by tabs, rows by newlines. That is all this
 * parses.
 *
 * ## It refuses rather than partly applying
 *
 * A paste that lands some cells and skips others is worse than one that does
 * nothing, because the teacher cannot see which took. Worse still on this
 * instrument: the marks are single letters, so a misaligned paste produces a
 * grid that looks entirely plausible and says the wrong thing about a class of
 * six-year-olds. So anything unrecognised rejects the whole block and names
 * what it choked on.
 *
 * An **empty** cell is not unrecognised — it means "no mark", and clears.
 * That is what an empty cell means in DepEd's workbook too.
 */
export type PastedDescriptors =
  | { ok: true; rows: Array<Array<MatatagDescriptor | null>> }
  | { ok: false; reason: string }

/** Excel wraps a cell in quotes only when it contains a tab or a newline, but
 * some clipboards quote more eagerly, and `"A"` is meant as `A`. */
function unquote(cell: string): string {
  const trimmed = cell.trim()

  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed
}

export function parsePastedDescriptors(
  text: string,
  letters: readonly MatatagDescriptor[],
): PastedDescriptors {
  const lines = text
    .replace(/\r\n?/g, '\n')
    // Spreadsheets end the block with a newline; that trailing empty line is
    // punctuation, not a row of cleared marks.
    .replace(/\n+$/, '')
    .split('\n')

  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    return { ok: false, reason: 'There was nothing on the clipboard to paste.' }
  }

  const rows: Array<Array<MatatagDescriptor | null>> = []
  const allowed = new Set<string>(letters)

  for (let r = 0; r < lines.length; r++) {
    const cells = lines[r].split('\t').map(unquote)
    const row: Array<MatatagDescriptor | null> = []

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]

      if (cell === '') {
        row.push(null)
        continue
      }

      const upper = cell.toUpperCase()

      if (!allowed.has(upper)) {
        // Named precisely, because the usual cause is a header row or a stray
        // column that came along with the copy, and the teacher needs to know
        // which one to leave behind.
        return {
          ok: false,
          reason:
            `Row ${r + 1}, column ${c + 1} of what you pasted is "${cell}", which is not one of ` +
            `${letters.join(', ')}. Nothing was changed — check you did not copy a heading row ` +
            'along with the marks.',
        }
      }

      row.push(upper as MatatagDescriptor)
    }

    rows.push(row)
  }

  // Every spreadsheet pads a copied block to a rectangle, so ragged rows mean
  // this did not come from one. Padding the short rows would clear marks the
  // teacher never meant to touch.
  const width = rows[0].length

  if (rows.some(row => row.length !== width)) {
    return {
      ok: false,
      reason:
        'The pasted rows are not all the same width, so where each mark belongs is ambiguous. ' +
        'Nothing was changed. Copy a rectangular block from the spreadsheet and try again.',
    }
  }

  return { ok: true, rows }
}
