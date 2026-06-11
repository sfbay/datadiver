import { useState, useCallback } from 'react'

interface ExportButtonProps {
  /** CSS selector for the element to capture */
  targetSelector: string
  /** Filename prefix for the exported PNG */
  filename?: string
}

// Download via blob + object URL — NOT canvas.toDataURL(). Chromium silently
// drops anchor downloads whose URL exceeds ~2MB, and map exports run 3-4MB;
// toDataURL "succeeds" but no file ever lands. Object URLs have no size cap.
function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas toBlob produced no data (tainted canvas?)'))
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `${filename}-${new Date().toISOString().split('T')[0]}.png`
      link.href = url
      link.click()
      // Revoking immediately can abort an in-flight download — defer it
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      resolve()
    }, 'image/png')
  })
}

export default function ExportButton({ targetSelector, filename = 'datadiver-export' }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleExport = useCallback(async () => {
    const target = document.querySelector(targetSelector)
    if (!target || isExporting) return

    setIsExporting(true)
    try {
      // html2canvas-pro is ~200KB and only needed here — load it on first click,
      // not in the main bundle. Vite caches the chunk after the first import.
      // (The -pro fork parses CSS Color 4 — oklab/oklch/color-mix — which
      // Tailwind v4 emits for every opacity modifier; html2canvas 1.x throws.)
      const { default: html2canvas } = await import('html2canvas-pro')

      // Get the Mapbox canvas if present — html2canvas can't render WebGL
      const mapCanvas = target.querySelector('.mapboxgl-canvas') as HTMLCanvasElement | null
      const rect = (target as HTMLElement).getBoundingClientRect()

      // The espresso/cream page background lives on <body>, outside every
      // capture div — without this, exports are transparent and glass cards
      // float over nothing.
      const pageBg = getComputedStyle(document.body).backgroundColor

      // Create a compositing canvas at 2x resolution
      const outCanvas = document.createElement('canvas')
      const scale = 2
      outCanvas.width = rect.width * scale
      outCanvas.height = rect.height * scale
      const ctx = outCanvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context failed')
      ctx.scale(scale, scale)

      // Layer 0: page background — painted under the map; the html2canvas
      // pass stays transparent so it doesn't occlude the map layer
      ctx.fillStyle = pageBg
      ctx.fillRect(0, 0, rect.width, rect.height)

      // Layer 1: Mapbox canvas (if present)
      if (mapCanvas) {
        const mapRect = mapCanvas.getBoundingClientRect()
        const offsetX = mapRect.left - rect.left
        const offsetY = mapRect.top - rect.top
        ctx.drawImage(mapCanvas, offsetX, offsetY, mapRect.width, mapRect.height)
      }

      // Layer 2: HTML overlay (stat cards, sidebars, etc.)
      const htmlCanvas = await html2canvas(target as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale,
        logging: false,
        // Skip the Mapbox canvas — we already captured it above
        ignoreElements: (el: Element) => el.classList?.contains('mapboxgl-canvas'),
        onclone: (clonedDoc: Document) => {
          if (document.documentElement.classList.contains('dark')) {
            clonedDoc.documentElement.classList.add('dark')
          }
        },
      })

      // Composite HTML on top of the map
      ctx.drawImage(htmlCanvas, 0, 0, rect.width, rect.height)

      await downloadCanvas(outCanvas, filename)
    } catch (err) {
      console.error('Export failed:', err)
      // Fallback: try basic html2canvas without compositing
      try {
        const { default: html2canvas } = await import('html2canvas-pro')
        const canvas = await html2canvas(target as HTMLElement, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: getComputedStyle(document.body).backgroundColor,
          scale: 2,
          logging: false,
          onclone: (clonedDoc: Document) => {
            if (document.documentElement.classList.contains('dark')) {
              clonedDoc.documentElement.classList.add('dark')
            }
          },
        })
        await downloadCanvas(canvas, filename)
      } catch (fallbackErr) {
        console.error('Fallback export also failed:', fallbackErr)
        setFailed(true)
        setTimeout(() => setFailed(false), 3000)
      }
    } finally {
      setIsExporting(false)
    }
  }, [targetSelector, filename, isExporting])

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        text-[11px] font-mono font-medium uppercase tracking-wider
        bg-white/80 dark:bg-white/[0.06]
        border border-slate-200/80 dark:border-white/[0.08]
        text-slate-500 dark:text-slate-400
        hover:bg-white dark:hover:bg-white/[0.1]
        hover:text-ink dark:hover:text-white
        disabled:opacity-50 disabled:cursor-wait
        transition-all duration-200
        shadow-sm
      "
      title="Export as PNG"
    >
      {isExporting ? (
        <>
          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          Exporting
        </>
      ) : failed ? (
        <span className="text-brick-500">Export failed</span>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.75 7h-3V1.75a.75.75 0 00-1.5 0V7h-3a.75.75 0 00-.53 1.28l3.75 3.75a.75.75 0 001.06 0l3.75-3.75A.75.75 0 0013.75 7z" />
            <path d="M3.5 13.25a.75.75 0 00-1.5 0v1.5A2.75 2.75 0 004.75 17.5h10.5A2.75 2.75 0 0018 14.75v-1.5a.75.75 0 00-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-1.5z" />
          </svg>
          PNG
        </>
      )}
    </button>
  )
}
