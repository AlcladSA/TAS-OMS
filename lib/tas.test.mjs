// npm test   (quotation maths must match the old Google Sheet)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calcM2, lineTotal, totals, describe, dispatchStatus, dmy, balanceOf, readyOf, actionData } from './tas.js'

test('quote maths', () => {
  assert.equal(calcM2(1250, 5600, 10), 70)
  assert.equal(calcM2(0, 5600, 10), 0)
  assert.equal(lineTotal(70, 10, 60), 4200)
  assert.equal(lineTotal(0, 10, 60), 600) // no size -> priced per piece
  assert.deepEqual(totals([{ total: 4200 }], 100), { subtotal: 4200, transport: 100, vat: 645, total: 4945 })
  assert.equal(describe({ brand: 'ALUMAX', grade: 'AL4025', color_code: 'AL4001', core: 'NFR', width: 1250, length: 3600, thickness: 4, color_name: 'Industrial Ash' }), 'ALUMAX-AL4025-AL4001-NFR-1250*3600*4 mm Industrial Ash')
  assert.equal(describe({ brand: 'ALUMAX', grade: 'AL4035', color_code: 'AL3008', width: 1250, length: 5600, thickness: 4 }), 'ALUMAX-AL4035-AL3008-1250*5600*4 mm')
  assert.equal(describe({ brand: 'ALUMAX', grade: 'AL4025', color_code: 'AL4001', width: 1250, length: 5600, thickness: 2 }), 'ALUMAX-AL4025-AL4001-1250*5600*2 mm')
  assert.equal(dispatchStatus({ delivered_qty: 10, dispatched_qty: 0 }), 'PENDING')
  assert.equal(dispatchStatus({ delivered_qty: 10, dispatched_qty: 4 }), 'PARTIAL')
  assert.equal(dispatchStatus({ delivered_qty: 10, dispatched_qty: 10 }), 'DISPATCHED')
  assert.equal(dmy('2026-10-23'), '23.10.2026')
  assert.equal(balanceOf({ qty: 10, dispatched_qty: 4 }), 6)
  assert.equal(balanceOf({ qty: 10, dispatched_qty: 12 }), 0)
  assert.equal(readyOf({ ready_qty: 3, delivered_qty: 9 }), 3)
  assert.equal(readyOf({ ready_qty: null, delivered_qty: 9 }), 9) // older rows
})

test('csv round trip', async () => {
  const { toCSV, parseCSV } = await import('./csv.js')
  const rows = [{ a: 'Al-Taliah, "Summit"', b: 'line1\nline2' }, { a: 'مؤسسة', b: '' }]
  const csv = toCSV(rows, [['Name', (r) => r.a], ['Note', (r) => r.b]])
  assert.ok(csv.startsWith('\uFEFFName,Note\r\n'))
  assert.deepEqual(parseCSV(csv), [{ name: 'Al-Taliah, "Summit"', note: 'line1\nline2' }, { name: 'مؤسسة', note: '' }])
  assert.deepEqual(parseCSV('code,name\r\nC1,One\r\n\r\n'), [{ code: 'C1', name: 'One' }])
})

test('manager role: every workflow role, never admin-only', async () => {
  const { can } = await import('./tas.js')
  const m = { role: 'manager' }
  for (const r of ['sales', 'approver', 'operations', 'accounts', 'plant']) assert.ok(can(m, r))
  assert.ok(can(m, 'plant', 'approver'))
  assert.ok(!can(m, 'admin'))
  assert.ok(can({ role: 'admin' }, 'admin'))
  assert.ok(!can({ role: 'sales' }, 'plant'))
})

test('action dialogs get only the lines they use', () => {
  const line = (id, qty, ready, sent) => ({ id, item_no: id, description: 'X', qty, ready_qty: ready, dispatched_qty: sent, total: 100, price: 5, color_name: 'RAL' })
  const batch = (id, pi) => ({ id, batch_no: id, do_no: 'DO', do_date: '2026-10-24', pi_no: pi, pi_date: pi && '2026-10-24', vehicle_no: 'V', items: [{ id: 9, do_qty: 3, order_item: line(1, 5, 0, 3) }] })
  const o = { id: 1, status: 'APPROVED', items: [line(1, 5, 2, 0), line(2, 5, 0, 0), line(3, 5, 5, 5)], batches: [batch(1, 'PI'), batch(2, null)] }
  const a = actionData(o)
  assert.deepEqual(a.items.map((it) => it.id), [1]) // ready and not yet fully dispatched
  assert.deepEqual(a.batches.map((b) => b.items.length), [0, 1]) // lines only for the DO still waiting for its PI
  assert.deepEqual(a.batches[1].items[0], { id: 9, do_qty: 3, order_item: { description: 'X', price: 5 } })
  assert.deepEqual(actionData({ ...o, status: 'PENDING' }).items, [{ total: 100 }, { total: 100 }, { total: 100 }])
})

// splitName: bilingual customer names
{
  const { splitName } = await import('./tas.js')
  const a = splitName('(Artplast Foundation) مؤسسة آرت بلاست')
  if (a.en !== 'Artplast Foundation' || a.ar !== 'مؤسسة آرت بلاست') throw new Error('splitName bilingual')
  const b = splitName('Ace Future Contracting Company')
  if (b.en !== 'Ace Future Contracting Company' || b.ar !== '') throw new Error('splitName english only')
  const c = splitName('(Note) plain')
  if (c.en !== '(Note) plain') throw new Error('splitName no arabic')
  console.log('splitName ok')
}

test('invoiceTotal matches the printed PI and batch_invoice_total(); payState splits paid / partly paid / due', async () => {
  const { invoiceTotal, payState } = await import('./tas.js')
  const o = { transport: 0, vat_rate: 0.15 }
  // 1,000.00 of goods + 50 batch transport + 15% VAT = 1,207.50 (migrate-023.test.mjs uses the same figures).
  const pi = { transport: 50, items: [{ invoiced_total: 1000.004 }] }
  assert.equal(invoiceTotal(pi, o), 1207.5)
  // A line without a total: m2 × price; no batch transport: the order's.
  assert.equal(invoiceTotal({ items: [{ do_m2: 5.5, order_item: { price: 40 } }] }, { transport: 0, vat_rate: 0.15 }), 253)
  assert.deepEqual(payState(1207.5, 0), { total: 1207.5, paid: 0, due: 1207.5, state: 'UNPAID' })
  assert.deepEqual(payState(1207.5, 500), { total: 1207.5, paid: 500, due: 707.5, state: 'PARTIAL' })
  assert.equal(payState(1207.5, 1207.5).state, 'PAID')
  assert.equal(payState(1207.5, 1207.495).state, 'PAID', 'a halala of rounding still counts as paid')
})
