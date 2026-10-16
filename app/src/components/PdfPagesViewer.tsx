import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Download } from 'lucide-react'
import { PdfMessage } from './ResponsivePdfViewer'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Draws a PDF's pages as images sized to the screen, for browsers that cannot
 * show a PDF inline. Loaded only by `ResponsivePdfViewer`, and only on those.
 */
export default function PdfPagesViewer({ url, fileName }: { url: string; fileName: string }) {
  const pagesRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  useEffect(() => {
    const element = pagesRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Drawn denser than the screen so the page stays legible when pinch-zoomed.
  const pixelRatio = Math.min(4, (typeof window === 'undefined' ? 1 : window.devicePixelRatio) * 2)

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-end border-b border-gray-200 bg-white p-2">
        <a
          href={url}
          download={fileName}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>
      <div ref={pagesRef} className="flex-1 overflow-auto bg-gray-100 p-2">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
          loading={<PdfMessage>Loading document…</PdfMessage>}
          error={<PdfMessage tone="error">The document could not be displayed. Use Download to open it instead.</PdfMessage>}
        >
          {width > 0 &&
            Array.from({ length: pageCount }, (_, index) => (
              <Page
                key={index}
                pageNumber={index + 1}
                width={width}
                devicePixelRatio={pixelRatio}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="mb-2 shadow-sm"
              />
            ))}
        </Document>
      </div>
    </div>
  )
}
