import { lazy, Suspense, useMemo, type ComponentProps, type CSSProperties, type ReactElement } from 'react'
import { BlobProvider, PDFViewer, type DocumentProps } from '@react-pdf/renderer'

// pdf.js is large and only phones need it, so it is fetched on first use.
const PdfPagesViewer = lazy(() => import('./PdfPagesViewer'))

/**
 * Whether this browser draws a PDF inside an iframe, which is all `PDFViewer` is.
 *
 * Phone browsers do not: Android Chrome shows a bare "Open" button where the
 * document should be, and iOS shows only the first page as a still image. A
 * touch iPad reports itself as a Mac, so it is caught by its touch points.
 */
function canShowPdfInline(): boolean {
  if (typeof navigator === 'undefined') return true

  const ua = navigator.userAgent
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac) return false

  return navigator.pdfViewerEnabled !== false
}

interface ResponsivePdfViewerProps {
  children: ReactElement<DocumentProps>
  className?: string
  style?: CSSProperties
  width?: string | number
  height?: string | number
  showToolbar?: boolean
  /** The name a phone saves the PDF under. */
  fileName?: string
}

/**
 * A drop-in for `PDFViewer` that still shows the document on a phone.
 *
 * Desktop browsers keep the iframe and its print toolbar. Elsewhere the PDF is
 * built to a blob and its pages are drawn as images, with a Download button
 * for printing or keeping a copy.
 */
export function ResponsivePdfViewer({
  children,
  className,
  style,
  width,
  height,
  showToolbar,
  fileName = 'document.pdf',
}: ResponsivePdfViewerProps) {
  const inline = useMemo(canShowPdfInline, [])

  if (inline) {
    return (
      <PDFViewer
        className={className}
        // The same few layout properties either way; react-pdf types them as its own Style.
        style={style as ComponentProps<typeof PDFViewer>['style']}
        width={width}
        height={height}
        showToolbar={showToolbar}
      >
        {children}
      </PDFViewer>
    )
  }

  return (
    <div className={className} style={{ width, height, ...style }}>
      <BlobProvider document={children}>
        {({ url, loading, error }) =>
          error ? (
            <PdfMessage tone="error">The document could not be prepared. Please try again later.</PdfMessage>
          ) : loading || !url ? (
            <PdfMessage>Preparing document…</PdfMessage>
          ) : (
            <Suspense fallback={<PdfMessage>Preparing document…</PdfMessage>}>
              <PdfPagesViewer url={url} fileName={fileName} />
            </Suspense>
          )
        }
      </BlobProvider>
    </div>
  )
}

export function PdfMessage({ children, tone }: { children: string; tone?: 'error' }) {
  return (
    <div className="w-full h-full flex items-center justify-center p-4 text-center">
      <div className={`text-sm ${tone === 'error' ? 'text-red-700' : 'text-gray-600'}`}>{children}</div>
    </div>
  )
}
