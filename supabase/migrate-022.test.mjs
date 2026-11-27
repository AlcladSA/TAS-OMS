// Test migrate-022 on PGlite: scrap on the DPR goes to the Scrap Yard, rejects of another size, one create_production.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = new URL('./', import.meta.url)
const db = new PGlite()

await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users (id uuid primary key, last_sign_in_at timestamptz, encrypted_password text);
  create table auth.sessions (user_id uuid);
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (metadata jsonb);
`)

await db.exec(readFileSync(new URL('schema.sql', dir), 'utf8'))
for (const f of readdirSync(dir).filter((f) => /^migrate-0(0[4-9]|1\d|2[0-2])\.sql$/.test(f)).sort()) {
  try {
    await db.exec(readFileSync(new URL(f, dir), 'utf8'))
  } catch (e) {
    throw new Error(`${f}: ${e.message}`)
  }
}
// Safe to run again: no duplicate scrap materials, no error.
await db.exec(readFileSync(new URL('migrate-022.sql', dir), 'utf8'))

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const all = async (sql, p = []) => (await db.query(sql, p)).rows

// Only the 5-argument create_production is left, so 4-argument callers (the app before this change) still resolve.
const fns = await all(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p where p.proname = 'create_production'`)
assert.equal(fns.length, 1, 'one create_production')
assert.equal((fns[0].a.match(/jsonb/g) || []).length, 5)

const scrapMats = await all(`select code, category, uom from materials where code like 'SCRAP-%' order by code`)
assert.deepEqual(scrapMats.map((m) => m.code), ['SCRAP-ALU', 'SCRAP-CORE', 'SCRAP-PANEL'])
assert.ok(scrapMats.every((m) => m.category === 'SCRAP' && m.uom === 'KG'))

await db.exec(`
  insert into plants (code, name) values ('P1', 'Plant 1'), ('P2', 'Plant 2');
  insert into stores (plant_code, code, name, type) values
    ('P1', 'RM-1', 'Main RM Store', 'RM'), ('P1', 'L1', 'Line 1', 'WIP'), ('P1', 'SCRAP-01', 'Scrap Yard', 'SCRAP'),
    ('P2', 'RM-2', 'RM 2', 'RM'), ('P2', 'L2', 'Line 2', 'WIP');
  insert into materials (code, name, category, uom) values ('COIL-TOP', 'Top Coil', 'RM', 'KG');
  insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
  values ('2026-11-27', (select id from stores where code = 'RM-1'), (select id from materials where code = 'COIL-TOP'), 1000, 'OPENING', 'INIT', 'Admin'),
         ('2026-11-27', (select id from stores where code = 'RM-2'), (select id from materials where code = 'COIL-TOP'), 1000, 'OPENING', 'INIT', 'Admin');
`)
const id = async (table, code) => (await one(`select id from ${table} where code = $1`, [code])).id
const [l1, l2, scrapYard, top, alu, core, panel] = [await id('stores', 'L1'), await id('stores', 'L2'), await id('stores', 'SCRAP-01'),
  await id('materials', 'COIL-TOP'), await id('materials', 'SCRAP-ALU'), await id('materials', 'SCRAP-CORE'), await id('materials', 'SCRAP-PANEL')]
const fg = (await one(`select fg_item_for('ALCLAD', 'AL4045', 'AL3004', 'Milky White', 'FRB1', 0.4, 1500, 2450, 4, false) id`)).id
const head = (line, shift = 'DAY') => JSON.stringify({ date: '2026-11-27', shift, line, by: 'Operator' })
const use = JSON.stringify([{ layer_type: 'TOP_COIL', material_id: top, actual_qty: 100, uom: 'KG' }])

// 1. DPR with scrap and a reject cut shorter: scrap recorded and posted into the Scrap Yard, same transaction.
const items = JSON.stringify([
  { item: fg, good: 10, rejected: 0 },
  { item: fg, good: 0, rejected: 2, reason: 'Cut short', reject_width: 1500, reject_length: 850 },
])
const wastage = JSON.stringify([
  { scrap_type: 'ALU_TRIM', material_id: alu, expected_kg: 4.2, actual_kg: 5 },
  { scrap_type: 'ALU_PROCESS', material_id: alu, expected_kg: 0.5, actual_kg: 0.6 },
  { scrap_type: 'CORE_WASTE', material_id: core, expected_kg: 30, actual_kg: 28.5 },
  { scrap_type: 'PANEL_REJECT', material_id: panel, expected_kg: 14, actual_kg: 14, note: '2 short pieces' },
])
const dpr = (await one(`select create_production($1::jsonb, $2::jsonb, '[]'::jsonb, $3::jsonb, $4::jsonb) no`, [head(l1), items, use, wastage])).no
assert.match(dpr, /DPR/)
const prodId = (await one(`select id from productions where dpr_no = $1`, [dpr])).id

const w = await all(`select scrap_type, expected_kg, actual_kg from production_wastage where production_id = $1 order by id`, [prodId])
assert.deepEqual(w.map((r) => [r.scrap_type, Number(r.actual_kg)]), [['ALU_TRIM', 5], ['ALU_PROCESS', 0.6], ['CORE_WASTE', 28.5], ['PANEL_REJECT', 14]])
assert.equal(Number(w[2].expected_kg), 30)

// One SCRAP move per material, into the Scrap Yard, adding stock.
const sm = await all(`select material_id, qty, ref_no from stock_moves where ref_type = 'SCRAP' order by material_id`)
assert.equal(sm.length, 3)
assert.ok(sm.every((m) => m.ref_no === dpr))
const yard = Object.fromEntries((await all(`select material_id, sum(qty) q from stock_moves where store_id = $1 group by 1`, [scrapYard])).map((r) => [r.material_id, Number(r.q)]))
assert.equal(yard[alu], 5.6)
assert.equal(yard[core], 28.5)
assert.equal(yard[panel], 14)
// The stock report sees it as stock coming in.
const sum = await all(`select code, inward, closing from stock_summary('2026-11-01', '2026-11-30', null, $1)`, [scrapYard])
assert.equal(Number(sum.find((r) => r.code === 'SCRAP-ALU').closing), 5.6)

// Reject of another size is kept on the row; it has no good pieces, so it never waits for FG QC.
const rej = await one(`select good_qty, rejected_qty, reject_width, reject_length from production_items where production_id = $1 and good_qty = 0`, [prodId])
assert.equal(Number(rej.reject_length), 850)
assert.equal(Number(rej.reject_width), 1500)
assert.equal(Number((await one(`select in_qc from fg_position() where fg_item_id = $1`, [fg])).in_qc), 10, 'only the 10 good pieces wait for QC')

// 2. Old 4-argument call still works and posts no scrap.
const before = Number((await one(`select count(*) c from stock_moves where ref_type = 'SCRAP'`)).c)
const dpr2 = (await one(`select create_production($1::jsonb, $2::jsonb, '[]'::jsonb, $3::jsonb) no`, [head(l1, 'NIGHT'), JSON.stringify([{ item: fg, good: 1 }]), use])).no
assert.match(dpr2, /DPR/)
assert.equal(Number((await one(`select count(*) c from stock_moves where ref_type = 'SCRAP'`)).c), before)

// 3. Plant without a Scrap store: refused, nothing saved (not the DPR, not the RM issue).
const counts = async () => (await one(`select (select count(*) from productions) p, (select count(*) from transfers) t, (select count(*) from production_wastage) w`))
const c0 = await counts()
await assert.rejects(
  db.query(`select create_production($1::jsonb, $2::jsonb, '[]'::jsonb, $3::jsonb, $4::jsonb)`, [head(l2), JSON.stringify([{ item: fg, good: 1 }]), use,
    JSON.stringify([{ scrap_type: 'ALU_TRIM', material_id: alu, actual_kg: 1 }])]),
  /no Scrap store/,
)
assert.deepEqual(await counts(), c0)

// 4. A raw material instead of a scrap material, or 0 kg: refused.
await assert.rejects(db.query(`select create_production($1::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $2::jsonb)`, [head(l1),
  JSON.stringify([{ scrap_type: 'OTHER', material_id: top, actual_kg: 1 }])]), /scrap material/)
await assert.rejects(db.query(`select create_production($1::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $2::jsonb)`, [head(l1),
  JSON.stringify([{ scrap_type: 'ALU_TRIM', material_id: alu, actual_kg: 0 }])]), /above 0/)
assert.deepEqual(await counts(), c0)

// 5. The server is the only caller.
const grants = await all(`select has_function_privilege('anon', 'create_production(jsonb,jsonb,jsonb,jsonb,jsonb)', 'execute') anon,
                                 has_function_privilege('authenticated', 'create_production(jsonb,jsonb,jsonb,jsonb,jsonb)', 'execute') auth`)
assert.equal(grants[0].anon, false)
assert.equal(grants[0].auth, false)

console.log('migrate-022: all tests passed successfully!')
