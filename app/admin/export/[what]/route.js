import { notFound } from 'next/navigation'
import { batchQueues, db, fetchAll as all, filterOrders, requireRole } from '@/lib/server'
import { activityQuery, stamp } from '@/lib/activity'
import { csvResponse, itemListsCSV, toCSV } from '@/lib/csv'
import { ITEM_LISTS, MASTERS, balanceOf, dmy, round2, totals, today, describe } from '@/lib/tas'

// Excel downloads (CSV) for admins: /admin/export/<what>?from=YYYY-MM-DD&to=…&status=…&q=…
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
const period = (q, col, sp) => {
  if (isDay(sp.from)) q = q.gte(col, sp.from)
  if (isDay(sp.to)) q = q.lte(col, sp.to)
  return q
}
const orderTotal = (o) => totals(o.items || [], o.transport, o.vat_rate)

const EXPORTS = {
  orders: async (sp) => {
    const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
    const b = await batchQueues()
    const rows = await all(() => {
      let q = period(
        filterOrders(
          db().from('orders').select(
            '*, items:order_items(id, item_no, brand, grade, color_code, core, color_name, width, length, thickness, description, qty, price, total, dispatched_qty), batches:order_batches(id, do_no, pi_no, items:batch_items(id, order_item_id, do_qty, invoiced_qty, invoiced_price, invoiced_total))'
          ),
          sp.status || '',
          b
        ),
        'quote_date',
        sp
      ).order('id')
      if (term) q = q.or(`quote_no.ilike.%${term}%,customer_name.ilike.%${term}%,doc_no.ilike.%${term}%`)
      return q
    })

    const itemRows = rows.flatMap((o) => {
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

    return toCSV(itemRows, [
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
      ['Subtotal', (r) => orderTotal(r.order).subtotal],
      ['Transport', (r) => orderTotal(r.order).transport],
      ['VAT', (r) => orderTotal(r.order).vat],
      ['Total (SAR)', (r) => orderTotal(r.order).total],
      ['DO Nos', (r) => (r.order.batches || []).map((b) => b.do_no).filter(Boolean).join(' ')],
      ['PI Nos', (r) => (r.order.batches || []).map((b) => b.pi_no).filter(Boolean).join(' ')],
      ['Tax Invoice', (r) => (r.order.tax_invoice_path ? 'Yes' : 'No')],
      ['Approved / Rejected By', (r) => r.order.action_by],
      ['Reason', (r) => r.order.reject_reason || r.order.short_close_reason],
      ['Notes', (r) => r.order.notes],
    ])
  },
  lines: async (sp) => {
    const rows = await all(() => period(db().from('order_items').select('*, order:orders!inner(quote_no, quote_date, customer_name, status)'), 'order.quote_date', sp).order('order_id').order('item_no'))
    return toCSV(rows, [
      ['Quote No', (r) => r.order.quote_no], ['Quote Date', (r) => dmy(r.order.quote_date)], ['Customer', (r) => r.order.customer_name],
      ['Order Status', (r) => r.order.status], ['Line', (r) => r.item_no], ['Description', (r) => describe(r) || r.description], ['Color', (r) => r.color_name],
      ['Qty (PCS)', (r) => r.qty], ['M2', (r) => r.m2], ['Unit Price', (r) => r.price], ['Total', (r) => r.total],
      ['Plant Status', (r) => r.production_status], ['Dispatched', (r) => r.dispatched_qty], ['Balance', (r) => balanceOf(r)],
    ])
  },
  dispatches: async (sp) => {
    const rows = await all(() => period(db().from('dispatches').select('*, order:orders(quote_no, customer_name), item:order_items(item_no, brand, grade, color_code, core, color_name, width, length, thickness, description)'), 'dispatch_date', sp).order('dispatch_date').order('id'))
    return toCSV(rows, [
      ['Date', (r) => dmy(r.dispatch_date)], ['Quote No', (r) => r.order?.quote_no], ['Customer', (r) => r.order?.customer_name],
      ['Line', (r) => r.item?.item_no], ['Description', (r) => (r.item ? describe(r.item) || r.item.description : '')], ['Qty (PCS)', (r) => r.qty],
      ['Vehicle No', (r) => r.vehicle_no], ['Transporter', (r) => r.transporter], ['LR No', (r) => r.lr_no], ['Driver', (r) => r.driver], ['By', (r) => r.by_name],
    ])
  },
  invoices: async (sp) => {
    const rows = await all(() => period(db().from('order_batches').select('*, items:batch_items(invoiced_qty, invoiced_total), order:orders(quote_no, customer_code, customer_name, vat_no, vat_rate)').not('pi_no', 'is', null), 'pi_date', sp).order('pi_date').order('id'))
    const t = (b) => totals((b.items || []).map((i) => ({ total: i.invoiced_total })), b.transport, b.order?.vat_rate)
    return toCSV(rows, [
      ['PI No', (b) => b.pi_no], ['PI Date', (b) => dmy(b.pi_date)], ['DO No', (b) => b.do_no], ['Quote No', (b) => b.order?.quote_no],
      ['Customer Code', (b) => b.order?.customer_code], ['Customer', (b) => b.order?.customer_name], ['Customer VAT No', (b) => b.order?.vat_no],
      ['Qty (PCS)', (b) => round2((b.items || []).reduce((n, i) => n + Number(i.invoiced_qty || 0), 0))],
      ['Subtotal', (b) => t(b).subtotal], ['Transport', (b) => t(b).transport], ['VAT', (b) => t(b).vat], ['Total (SAR)', (b) => t(b).total],
      ['Tax Invoice Uploaded', (b) => (b.tax_invoice_path ? 'Yes' : 'No')], ['Price Note', (b) => b.price_note], ['By', (b) => b.pi_by],
    ])
  },
  customers: async () => {
    const rows = await all(() => db().from('customers').select('*, sp:profiles(full_name)').order('id'))
    return toCSV(rows, [...MASTERS.customers.cols.map((c) => [c, (r) => r[c]]), ['salesperson', (r) => r.sp?.full_name]])
  },
  'customers-template': async () => {
    const example = [{
      code: 'CUST-001',
      name: 'Al Rajhi Construction Ltd',
      type: 'CORPORATE',
      country: 'Saudi Arabia',
      address: 'King Fahd Road, Riyadh',
      cr_no: '1010123456',
      vat_no: '300123456700003',
      mobile: '+966501234567',
      email: 'purchasing@alrajhi.com',
      credit_limit: 500000,
      salesperson: '',
    }]
    return toCSV(example, [...MASTERS.customers.cols.map((c) => [c, (r) => r[c]]), ['salesperson', (r) => r.salesperson]])
  },
  // Inventory masters: same headers as their import.
  ...Object.fromEntries(['plants', 'stores', 'materials', 'vendors'].map((t) => [t, async () => {
    const rows = await all(() => db().from(t).select('*').order('id'))
    return toCSV(rows, MASTERS[t].cols.map((c) => [c, (r) => r[c]]))
  }])),
  'plants-template': async () => {
    const example = [{ code: 'PLANT-1', name: 'Riyadh Plant 1', address: '2nd Industrial City, Riyadh' }]
    return toCSV(example, MASTERS.plants.cols.map((c) => [c, (r) => r[c]]))
  },
  'stores-template': async () => {
    const example = [
      { plant_code: 'PLANT-1', code: 'RM-MAIN', name: 'Main Raw Material Store', type: 'RM' },
      { plant_code: 'PLANT-1', code: 'FG-MAIN', name: 'Main Finished Goods Store', type: 'FG' },
      { plant_code: 'PLANT-1', code: 'LINE-1', name: 'Continuous ACP Line 1', type: 'WIP' },
    ]
    return toCSV(example, MASTERS.stores.cols.map((c) => [c, (r) => r[c]]))
  },
  'vendors-template': async () => {
    const example = [{
      code: 'VDR-001',
      name: 'Saudi Aluminium Industries',
      vat_no: '300987654300003',
      mobile: '+966551234567',
      email: 'sales@saudialum.com',
      address: 'Industrial Area Phase 1, Jeddah',
    }]
    return toCSV(example, MASTERS.vendors.cols.map((c) => [c, (r) => r[c]]))
  },
  'materials-template': async () => {
    const example = [
      {
        code: 'AL4001-SDPE-0.40*1270-Industrial Ash',
        name: 'Industrial Ash Coil (0.40*1270)',
        category: 'RM',
        kind: 'TOP_COIL',
        mat_type: 'SDPE',
        color_code: 'AL4001',
        thickness: 0.40,
        width: 1270,
        uom: 'KG',
        cost_price: 18.5,
        min_level: 1000,
        max_level: 10000,
      },
      {
        code: '1000027815',
        name: 'LDPE RECYCLED GRANULE',
        category: 'GRANULE',
        kind: 'CORE',
        mat_type: 'PE',
        color_code: null,
        thickness: null,
        width: null,
        uom: 'KG',
        cost_price: 4.2,
        min_level: 2000,
        max_level: 20000,
      },
    ]
    return toCSV(example, MASTERS.materials.cols.map((c) => [c, (r) => r[c]]))
  },
  // Item master in the sheet layout (one column per list); items-template = headers + one example row.
  items: async () => {
    const rows = await all(() => db().from('item_lists').select('list, value, name').order('id'))
    const lists = {}
    for (const r of rows) (lists[r.list] ??= []).push(r)
    for (const d of ITEM_LISTS) if (d.number) lists[d.key]?.sort((a, b) => a.value - b.value)
    return itemListsCSV(lists, ITEM_LISTS)
  },
  'items-template': async () => itemListsCSV({
    brand: [{ value: 'ALUMAX' }], color: [{ value: 'AL4001', name: 'Industrial Ash' }], grade: [{ value: 'AL4025' }],
    core: [{ value: 'NFR' }], skin: [{ value: '0.2' }], width: [{ value: '1250' }], length: [{ value: '5600' }],
    thickness: [{ value: '4' }], uom: [{ value: 'M2' }],
  }, ITEM_LISTS),
  activity: async (sp) => {
    const rows = await all(() => activityQuery(sp))
    return toCSV(rows, [
      ['When', (e) => stamp(e.at)], ['User', (e) => e.by_name], ['Action', (e) => e.action], ['Order', (e) => e.order?.quote_no], ['Details', (e) => e.detail],
    ])
  },
}

const REPORT_EXPORTS = ['orders', 'lines', 'dispatches', 'invoices']

export async function GET(req, { params }) {
  const { what } = await params
  if (!EXPORTS[what]) notFound()
  // Report downloads are open to managers too; masters and the activity log stay admin-only.
  await requireRole(REPORT_EXPORTS.includes(what) ? 'manager' : 'admin')
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  try {
    return csvResponse(`${what}-${today()}`, await EXPORTS[what](sp))
  } catch (e) {
    console.error(`export ${what}:`, e.message)
    return new Response('Could not build the export. Try again; if it keeps failing, tell the admin.', { status: 500 })
  }
}
