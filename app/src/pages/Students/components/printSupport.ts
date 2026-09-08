/**
 * Shared plumbing for the Students screen's printable documents.
 *
 * Each document is built as its own standalone HTML page and handed to a new
 * window rather than printed out of the SPA, so the app's layout, navigation and
 * Tailwind reset stay off the paper. The stylesheet below is the part every one
 * of them wants — school header, ruled table, footer — and each document adds
 * only what is particular to it.
 */

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const formatNumber = (n: number) => new Intl.NumberFormat('en-PH').format(n)

export const PRINT_BASE_CSS = `
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
    header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
    header .inst { font-size: 18px; font-weight: 700; }
    header .addr { font-size: 11px; color: #4b5563; }
    header .title { font-size: 14px; font-weight: 600; margin-top: 8px; text-transform: uppercase; letter-spacing: .06em; }
    header .range { font-size: 12px; color: #374151; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 4px 8px; text-align: left; word-wrap: break-word; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.center, th.center { text-align: center; }
    td.empty { text-align: center; color: #6b7280; font-style: italic; }
    .note { color: #6b7280; font-style: italic; margin: 8px 0 0; }
    footer { margin-top: 20px; font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    /* Repeat the column headings when a table runs past the foot of a page. */
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @media print { body { margin: 0; } footer { page-break-before: avoid; } }`

/** Prints once the document has laid out, then closes its own window. */
export const PRINT_ON_LOAD_SCRIPT =
  '<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>'

/**
 * Hands a built document to its own window.
 *
 * Returns false when a pop-up blocker refused the window, so the caller can say
 * so — the print would otherwise fail silently.
 */
export function openPrintDocument(html: string): boolean {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) return false

  printWindow.document.write(html)
  printWindow.document.close()

  return true
}
