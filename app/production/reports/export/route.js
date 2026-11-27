import { requireRole, db } from '@/lib/server'
import { csvResponse, toCSV } from '@/lib/csv'
import { storeLabel, today } from '@/lib/tas'
import { SCRAP_TYPES } from '@/lib/bom'

export async function GET(req) {
  await requireRole('manager')
  const { searchParams } = new URL(req.url)
  const to = searchParams.get('to') || today()
  const from = searchParams.get('from') || `${to.slice(0, 8)}01`

  // ?kind=scrap: scrap weighed on DPRs (Wastage & Scrap tab), apart from consumption.
  if (searchParams.get('kind') === 'scrap') {
    const { data: rows, error } = await db()
      .from('production_wastage')
      .select('*, p:productions!inner(id, prod_date, shift, dpr_no, line:stores(id, name, plant_code)), m:materials(code, name)')
      .gte('p.prod_date', from)
      .lte('p.prod_date', to)
      .order('id', { ascending: false })
    if (error && /production_wastage/.test(error.message)) return new Response('Run migrate-022.sql in Supabase first: scrap is recorded from then on.', { status: 409 })
    if (error) return new Response('Could not build export: ' + error.message, { status: 500 })
    rows?.sort((a, b) => (b.p?.prod_date || '').localeCompare(a.p?.prod_date || '') || b.id - a.id)
    return csvResponse(`scrap-${from}-to-${to}`, toCSV(rows || [], [
      ['Date', (r) => r.p?.prod_date],
      ['DPR No', (r) => r.p?.dpr_no],
      ['Shift', (r) => r.p?.shift],
      ['Line', (r) => storeLabel(r.p?.line)],
      ['Scrap Type', (r) => SCRAP_TYPES[r.scrap_type]?.label || r.scrap_type],
      ['Scrap Material Code', (r) => r.m?.code],
      ['Scrap Material', (r) => r.m?.name],
      ['Expected (BOM) KG', (r) => r.expected_kg],
      ['Actual Weighed KG', (r) => r.actual_kg],
      ['Difference KG', (r) => Math.round((Number(r.actual_kg) - Number(r.expected_kg)) * 1000) / 1000],
      ['Note', (r) => r.note || ''],
    ]))
  }

  const { data: rows, error } = await db()
    .from('production_consumptions')
    .select('*, p:productions!inner(id, prod_date, shift, dpr_no, line:stores(id, name, plant_code)), m:materials!material_id(id, code, name, uom)')
    .gte('p.prod_date', from)
    .lte('p.prod_date', to)
    .order('id', { ascending: false })

  if (error) {
    return new Response('Could not build export: ' + error.message, { status: 500 })
  }

  // Sort by production date descending
  rows?.sort((a, b) => (b.p?.prod_date || '').localeCompare(a.p?.prod_date || '') || b.id - a.id)

  const csv = toCSV(rows || [], [
    ['Date', (r) => r.p?.prod_date],
    ['DPR No', (r) => r.p?.dpr_no],
    ['Shift', (r) => r.p?.shift],
    ['Line', (r) => storeLabel(r.p?.line)],
    ['Layer Type', (r) => r.layer_type],
    ['Material Code', (r) => r.m?.code],
    ['Material Name', (r) => r.m?.name],
    ['UoM', (r) => r.uom],
    ['System BOM Qty', (r) => r.system_qty],
    ['Actual Consumed Qty', (r) => r.actual_qty],
    ['Variance Qty', (r) => r.diff_qty],
    ['Variance %', (r) => `${r.diff_pct}%`],
    ['Reason / Note', (r) => r.reason || ''],
  ])

  return csvResponse(`day-wise-consumption-${from}-to-${to}`, csv)
}
