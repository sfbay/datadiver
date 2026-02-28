import { useState, useCallback } from 'react'
import html2canvas from 'html2canvas'

interface ExportButtonProps {
  /** CSS selector or ref for the element to capture */
  targetSelector: string
  /** Filename prefix for the exported PNG */
  filename?: string
}

export default function ExportButton({ targetSelector, filename = 'datadiver-export' }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = useCallback(async () => {
    const target = document.querySelector(targetSelector)
    if (!target || isExporting) return

    setIsExporting(true)
    try {
      const canvas = await html2canvas(target as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 2, // retina quality
        logging: false,
        // Capture Mapbox canvas properly
        onclone: (clonedDoc) => {
          // Ensure the cloned document preserves dark mode class
          if (document.documentElement.classList.contains('dark')) {
            clonedDoc.documentElement.classList.add('dark')
          }
        },
      })

      const link = document.createElement('a')
      link.download = `${filename}-${new Date().toISOString().split('T')[0]}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
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
