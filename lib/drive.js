// Google Drive integration for tax invoices, auto-archived PDFs, and monthly CSV exports.
// Base folder configured in GOOGLE_DRIVE_FOLDER_ID.
// Sign-in: GOOGLE_SERVICE_ACCOUNT_JSON (Workspace Shared Drive) or GOOGLE_CLIENT_ID/SECRET + GOOGLE_REFRESH_TOKEN (Gmail).
import { createSign } from 'node:crypto'
import { db } from './server.js'
import { dmy, totals, describe } from './tas.js'
import { toCSV } from './csv.js'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const ALL = 'supportsAllDrives=true'
let cached = { token: '', exp: 0 }

async function token() {
  if (Date.now() < cached.exp) return cached.token
  const env = process.env
  let body
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    const now = Math.floor(Date.now() / 1000)
    const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const jwt = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    })}`
    const sig = createSign('RSA-SHA256').update(jwt).sign(sa.private_key, 'base64url')
    body = { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${jwt}.${sig}` }
  } else {
    body = { grant_type: 'refresh_token', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN }
  }
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(`Google sign-in failed: ${j.error_description || j.error}`)
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }
  return j.access_token
}

const auth = async () => ({ Authorization: `Bearer ${await token()}` })

// Finds or creates a subfolder inside the root Google Drive folder
export async function findOrCreateSubFolder(folderName) {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured')
  const t = await token()

  const q = `'${rootId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const searchUrl = `${API}?q=${encodeURIComponent(q)}&${ALL}&fields=files(id,name)`
  const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${t}` } })
  const data = await res.json()
  if (data.files && data.files.length > 0) {
    return data.files[0].id
  }

  // Create subfolder
  const createRes = await fetch(`${API}?${ALL}&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId]
    })
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error(created.error?.message || `Failed to create folder ${folderName}`)
  return created.id
}

// Uploads or updates an existing file in a specific folder (prevents duplicates)
export async function uploadOrUpdateFile(parentId, fileName, mimeType, content) {
  const t = await token()

  // Check if file already exists in this folder
  const q = `'${parentId}' in parents and name = '${fileName}' and trashed = false`
  const searchUrl = `${API}?q=${encodeURIComponent(q)}&${ALL}&fields=files(id,name)`
  const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${t}` } })
  const searchData = await searchRes.json()
  const existing = searchData.files && searchData.files[0]

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({
    name: fileName,
    parents: existing ? undefined : [parentId]
  })], { type: 'application/json' }))
  form.append('file', new Blob([content], { type: mimeType }))

  let uploadUrl = `${UPLOAD}?uploadType=multipart&${ALL}&fields=id,name,webViewLink`
  let method = 'POST'

  if (existing) {
    uploadUrl = `${UPLOAD}/${existing.id}?uploadType=multipart&${ALL}&fields=id,name,webViewLink`
    method = 'PATCH'
  }

  const res = await fetch(uploadUrl, {
    method,
    headers: { Authorization: `Bearer ${t}` },
    body: form
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error?.message || `Drive upload failed for ${fileName}`)
  return result
}

// Uploads into the folder and returns the value to store in tax_invoice_path.
export async function saveInvoice(name, file) {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] })], { type: 'application/json' }))
  form.append('file', file)
  const r = await fetch(`${UPLOAD}?uploadType=multipart&${ALL}&fields=id`, { method: 'POST', headers: await auth(), body: form })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message || 'Drive upload failed')
  return `drive:${j.id}`
}

// Streams the file back through the app, so only signed-in users who can see the order can open it.
export async function openInvoice(path) {
  if (!path.startsWith('drive:')) {
    const { data, error } = await db().storage.from('tax-invoices').createSignedUrl(path, 60)
    if (error) throw error
    return Response.redirect(data.signedUrl, 302)
  }
  const r = await fetch(`${API}/${path.slice(6)}?alt=media&${ALL}`, { headers: await auth() })
  if (!r.ok) throw new Error(`Drive download failed (${r.status})`)
  return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'application/pdf', 'content-disposition': 'inline' } })
}

// Best effort: a file already gone from Drive or storage is not an error.
export async function removeInvoices(paths) {
  const list = paths.filter(Boolean)
  const old = list.filter((p) => !p.startsWith('drive:'))
  if (old.length) await db().storage.from('tax-invoices').remove(old)
  await Promise.all(list.filter((p) => p.startsWith('drive:')).map(async (p) =>
    fetch(`${API}/${p.slice(6)}?${ALL}`, { method: 'DELETE', headers: await auth() }).catch(() => {})))
}

// Auto-archives a generated document PDF into its categorized subfolder in Google Drive
export async function archiveDocumentPdf(docNo, fileName, pdfBuffer) {
  const upper = String(docNo || fileName || '').toUpperCase()
  let subfolder = 'Documents'
  if (upper.startsWith('PO-')) subfolder = 'Purchase Orders'
  else if (upper.startsWith('Q-')) subfolder = 'Quotations'
  else if (upper.startsWith('DO-')) subfolder = 'Delivery Orders'
  else if (upper.startsWith('PI-')) subfolder = 'Proforma Invoices'
  else if (upper.startsWith('GRN-')) subfolder = 'Goods Received'
  else if (upper.startsWith('ISS-')) subfolder = 'Warehouse Issues'
  else if (upper.startsWith('DPR-')) subfolder = 'Production DPR'
  else if (upper.startsWith('PLAN-')) subfolder = 'Production Plans'

  const folderId = await findOrCreateSubFolder(subfolder)
  const cleanName = String(fileName || docNo || 'document')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .trim()
  const finalFilename = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`

  const uploadResult = await uploadOrUpdateFile(folderId, finalFilename, 'application/pdf', pdfBuffer)
  return {
    ok: true,
    fileId: uploadResult.id,
    fileName: finalFilename,
    folder: subfolder,
    folderId
  }
}

// Exports the detailed monthly orders CSV directly into the 'Monthly Exports' folder in Google Drive
export async function syncMonthlyOrdersCsvToDrive(yearMonth) {
  const now = new Date()
  const ym = yearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const from = `${ym}-01`
  const to = `${ym}-${String(lastDay).padStart(2, '0')}`

  // Query all orders in this month
  const { data: rows, error } = await db()
    .from('orders')
    .select(
      '*, items:order_items(id, item_no, brand, grade, color_code, core, color_name, width, length, thickness, description, qty, price, total, dispatched_qty), batches:order_batches(id, do_no, pi_no, items:batch_items(id, order_item_id, do_qty, invoiced_qty, invoiced_price, invoiced_total))'
    )
    .gte('quote_date', from)
    .lte('quote_date', to)
    .order('id')

  if (error) throw error

  const itemRows = (rows || []).flatMap((o) => {
    const items = (o.items && o.items.length > 0)
      ? [...o.items].sort((a, b) => (a.item_no || 0) - (b.item_no || 0))
      : [null]

    return items.map((it) => {
      let doQty = 0
      let piQty = 0
      let piPrice = ''

      if (it) {
        const bis = (o.batches || []).flatMap((b) => b.items || []).filter((bi) => bi.order_item_id === it.id)
        doQty = bis.reduce((sum, bi) => sum + Number(bi.do_qty || 0), 0)
        if (!doQty && it.dispatched_qty) doQty = Number(it.dispatched_qty || 0)

        piQty = bis.reduce((sum, bi) => sum + Number(bi.invoiced_qty || 0), 0)

        const piPrices = bis
          .filter((bi) => bi.invoiced_price != null && Number(bi.invoiced_qty || 0) > 0)
          .map((bi) => Number(bi.invoiced_price))

        if (piPrices.length > 0) {
          const unique = [...new Set(piPrices)]
          piPrice = unique.length === 1 ? unique[0] : unique.join(', ')
        }
      }

      return { order: o, item: it, doQty, piQty, piPrice }
    })
  })

  const csv = toCSV(itemRows, [
    ['Quote No', (r) => r.order.quote_no],
    ['Quote Date', (r) => dmy(r.order.quote_date)],
    ['Customer Code', (r) => r.order.customer_code],
    ['Customer', (r) => r.order.customer_name],
    ['Salesperson', (r) => r.order.salesperson_name],
    ['Status', (r) => r.order.status],
    ['Dispatch', (r) => r.order.dispatch_status],
    ['Line', (r) => (r.item ? r.item.item_no : '')],
    ['Description', (r) => (r.item ? describe(r.item) || r.item.description : '')],
    ['Color', (r) => (r.item ? r.item.color_name || r.item.color_code || '' : '')],
    ['Quotation Qty (PCS)', (r) => (r.item ? r.item.qty : '')],
    ['DO Qty (PCS)', (r) => (r.item ? r.doQty : '')],
    ['PI Qty (PCS)', (r) => (r.item ? r.piQty : '')],
    ['Quotation Price (SAR)', (r) => (r.item ? r.item.price : '')],
    ['PI Price (SAR)', (r) => (r.item ? r.piPrice : '')],
    ['Line Total (SAR)', (r) => (r.item ? r.item.total : '')],
    ['Subtotal', (r) => totals(r.order.items || [], r.order.transport, r.order.vat_rate).subtotal],
    ['Transport', (r) => totals(r.order.items || [], r.order.transport, r.order.vat_rate).transport],
    ['VAT', (r) => totals(r.order.items || [], r.order.transport, r.order.vat_rate).vat],
    ['Total (SAR)', (r) => totals(r.order.items || [], r.order.transport, r.order.vat_rate).total],
    ['DO Nos', (r) => (r.order.batches || []).map((b) => b.do_no).filter(Boolean).join(' ')],
    ['PI Nos', (r) => (r.order.batches || []).map((b) => b.pi_no).filter(Boolean).join(' ')],
    ['Tax Invoice', (r) => (r.order.tax_invoice_path ? 'Yes' : 'No')],
    ['Approved / Rejected By', (r) => r.order.action_by],
    ['Reason', (r) => r.order.reject_reason || r.order.short_close_reason],
    ['Notes', (r) => r.order.notes],
  ])

  const folderId = await findOrCreateSubFolder('Monthly Exports')
  const fileName = `Orders_${ym}.csv`
  const result = await uploadOrUpdateFile(folderId, fileName, 'text/csv', csv)

  return {
    ok: true,
    fileId: result.id,
    fileName,
    month: ym,
    rowCount: itemRows.length,
    folderId
  }
}
