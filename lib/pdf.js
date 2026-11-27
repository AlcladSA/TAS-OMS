'use client'

export async function downloadPdfFromElement(rootElement, filename = 'document') {
  if (typeof window === 'undefined') return

  const html2pdf = (await import('html2pdf.js')).default

  // Find the .doc element (either direct .doc, inside iframe, or inside .print-only)
  let el = null
  if (rootElement) {
    if (rootElement.classList?.contains('doc')) {
      el = rootElement
    } else {
      el = rootElement.querySelector?.('.doc') ||
           rootElement.querySelector?.('.print-only .doc') ||
           rootElement.querySelector?.('iframe')?.contentDocument?.querySelector?.('.doc')
    }
  }
  if (!el) {
    el = document.querySelector('.doc') || document.querySelector('.print-only .doc')
  }
  if (!el) {
    console.warn('downloadPdf: No printable .doc element found')
    return
  }

  const isHidden = window.getComputedStyle(el).display === 'none' ||
                   (el.parentElement && window.getComputedStyle(el.parentElement).display === 'none')
  let target = el
  let container = null

  if (isHidden) {
    container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.top = '0'
    container.style.width = '190mm'
    container.style.background = '#ffffff'
    container.style.zIndex = '-9999'

    const clone = el.cloneNode(true)
    clone.style.display = 'block'
    container.appendChild(clone)
    document.body.appendChild(container)
    target = clone
  }

  try {
    const cleanFilename = String(filename || 'document')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '_')
      .trim()
    const finalFilename = cleanFilename.toLowerCase().endsWith('.pdf') ? cleanFilename : `${cleanFilename}.pdf`

    const opt = {
      margin: [6, 6, 6, 6],
      filename: finalFilename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        backgroundColor: '#ffffff',
        logging: false,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }
    const worker = html2pdf().set(opt).from(target)
    await worker.save()

    // Auto-archive generated PDF copy to Google Drive in the background
    worker.output('blob').then(async (blob) => {
      try {
        const fd = new FormData()
        fd.append('file', blob, finalFilename)
        fd.append('docNo', cleanFilename)
        fd.append('fileName', finalFilename)
        await fetch('/api/drive/archive-pdf', {
          method: 'POST',
          body: fd,
        })
      } catch (err) {
        console.warn('Google Drive auto-archive skipped or failed:', err)
      }
    }).catch(() => {})
  } finally {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }
}
