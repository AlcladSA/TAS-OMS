import { currentUser } from '@/lib/server'
import { archiveDocumentPdf } from '@/lib/drive'

export async function POST(req) {
  try {
    const me = await currentUser()
    if (!me) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    const docNo = formData.get('docNo') || 'document'
    const fileName = formData.get('fileName') || `${docNo}.pdf`

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const res = await archiveDocumentPdf(docNo, fileName, buffer)
    return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error('API /api/drive/archive-pdf error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Drive archive failed' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}
