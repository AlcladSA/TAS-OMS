// Test migrate-023 on PGlite: payments against each PI, part payments, the balance, and the Payment due count.
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
for (const f of readdirSync(dir).filter((f) => /^migrate-0(0[4-9]|1\d|2[0-3])\.sql$/.test(f)).sort()) {
  try {
    await db.exec(readFileSync(new URL(f, dir), 'utf8'))
  } catch (e) {
    throw new Error(`${f}: ${e.message}`)
  }
}
await db.exec(readFileSync(new URL('migrate-023.sql', dir), 'utf8')) // safe to run again

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const counts = async () => (await one(`select order_counts() c`)).c

// An approved order with one shipped line, two DOs: one with a PI (1,000.00 of goods + 50 transport), one without.
await db.exec(`
  insert into customers (code, name) values ('C1', 'Cust');
  insert into orders (customer_id, customer_code, customer_name, status, dispatch_status, transport, vat_rate)
    values (1, 'C1', 'Cust', 'APPROVED', 'DISPATCHED', 0, 0.15);
  insert into order_items (order_id, item_no, description, qty, m2, price, total, dispatched_qty)
    values (1, 1, 'Panel', 10, 30.5, 40, 1220, 10);
  insert into order_batches (order_id, batch_no, do_no, do_date, pi_no, pi_date, transport, tax_invoice_path)
    values (1, 1, 'DO-1', '2026-11-27', 'PI-1', '2026-11-27', 50, 'drive:x'),
           (1, 2, 'DO-2', '2026-11-27', null, null, 0, null);
  insert into batch_items (batch_id, order_item_id, do_qty, do_m2, invoiced_qty, invoiced_m2, invoiced_price, invoiced_total)
    values (1, 1, 8, 25, 8, 25, 40, 1000.004), (2, 1, 2, 5.5, null, null, null, null);
  update orders set do_date = '2026-11-27', pi_date = '2026-11-27', tax_invoice_path = 'drive:x';
`)

// Invoice total as the printed PI: 1,000.00 + 50.00 transport + 15% VAT (157.50) = 1,207.50.
assert.equal(Number((await one(`select batch_invoice_total(1) t`)).t), 1207.5)
// A DO with no PI yet prices its lines at m2 × the order price: 5.5 × 40 = 220, + 33 VAT.
assert.equal(Number((await one(`select batch_invoice_total(2) t`)).t), 253)

// Unpaid PI: the order is Payment due and still active.
let c = await counts()
assert.equal(c.V, 4)
assert.equal(c.AWAIT_PAYMENT, 1)
assert.equal(c.ACTIVE, 1)

const pay = (batch, amount) => db.query(`select record_payment($1, $2, '2026-11-27', 'Bank transfer', 'TT-1', null, 'Accounts') s`, [batch, amount])

// No PI yet: refused.
await assert.rejects(pay(2, 10), /Make the PI first/)
// Part payment, then more than the balance is refused, then the rest.
assert.equal((await pay(1, 500)).rows[0].s, 'PARTIAL')
assert.equal((await one(`select paid_full from order_batches where id = 1`)).paid_full, false)
await assert.rejects(pay(1, 800), /more than the balance of PI-1 \(SAR 707\.50\)/)
await assert.rejects(pay(1, 0), /above 0/)
assert.equal((await pay(1, 707.5)).rows[0].s, 'PAID')
assert.equal((await one(`select paid_full from order_batches where id = 1`)).paid_full, true)
assert.equal(Number((await one(`select sum(amount) s from payments where batch_id = 1`)).s), 1207.5)

// Paid in full: no longer Payment due. (Batch 2 still needs its PI, so the order stays active for that.)
c = await counts()
assert.equal(c.AWAIT_PAYMENT, 0)
assert.equal(c.AWAIT_PI, 1)

// Undo the last payment: back to Payment due.
const last = (await one(`select max(id) id from payments`)).id
assert.equal((await one(`select delete_payment($1) s`, [last])).s, 'PARTIAL')
assert.equal((await one(`select paid_full from order_batches where id = 1`)).paid_full, false)
assert.equal((await counts()).AWAIT_PAYMENT, 1)
await assert.rejects(db.query(`select delete_payment($1)`, [last]), /already removed/)

// A cancelled order takes no payments.
await db.exec(`update orders set status = 'CANCELLED' where id = 1`)
await assert.rejects(pay(1, 1), /approved orders/)

// Only the server may call these.
const g = await one(`select has_function_privilege('anon', 'record_payment(bigint,numeric,date,text,text,text,text)', 'execute') a,
                            has_function_privilege('authenticated', 'delete_payment(bigint)', 'execute') b`)
assert.equal(g.a, false)
assert.equal(g.b, false)

console.log('migrate-023: all tests passed successfully!')
