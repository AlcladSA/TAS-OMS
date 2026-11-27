-- Payments received against each invoice (DO/PI batch). Run once in the Supabase SQL Editor; safe to run again.
--
-- 1. payments: one row per payment received (part payments allowed), against one PI.
-- 2. order_batches.paid_full: set when the PI is paid in full, so the queues can tell without adding up.
-- 3. batch_invoice_total(): the PI's total exactly as the printed PI works it out (lines + transport, VAT on both).
-- 4. record_payment / delete_payment: refuse a payment above the balance; keep paid_full right.
-- 5. order_counts V4: AWAIT_PAYMENT, and an order stays ACTIVE until every PI is paid.

-- 1-2. Payments and the paid-in-full flag
create table if not exists payments (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references orders on delete cascade,
  batch_id   bigint not null references order_batches on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0),
  paid_on    date not null,
  method     text not null default 'Bank transfer',
  reference  text,
  note       text,
  by_name    text,
  created_at timestamptz not null default now()
);
create index if not exists payments_batch_idx on payments (batch_id);
create index if not exists payments_order_idx on payments (order_id);
alter table payments enable row level security; -- no policies: only the server (service role) reads it

alter table order_batches add column if not exists paid_full boolean not null default false;

-- 3. Same sum as Doc.js for a PI: line totals (or m2 × price when a line has none) rounded, + transport (the batch's,
--    else the order's), VAT at the order's own rate on both, each rounded to halalas like round2() in lib/tas.js.
create or replace function batch_invoice_total(p_batch bigint) returns numeric language sql stable as $$
  with h as (
    select round(coalesce(b.transport, o.transport, 0), 2) tr, coalesce(o.vat_rate, 0.15) rate
      from order_batches b join orders o on o.id = b.order_id where b.id = p_batch
  ), s as (
    select round(coalesce(sum(coalesce(bi.invoiced_total, coalesce(bi.invoiced_m2, bi.do_m2) * coalesce(bi.invoiced_price, oi.price))), 0), 2) sub
      from batch_items bi join order_items oi on oi.id = bi.order_item_id where bi.batch_id = p_batch
  )
  select s.sub + h.tr + round((s.sub + h.tr) * h.rate, 2) from h, s
$$;

-- 4. Record a payment against a PI. Returns 'PAID' or 'PARTIAL'.
create or replace function record_payment(p_batch bigint, p_amount numeric, p_date date, p_method text, p_ref text, p_note text, p_by text)
returns text language plpgsql as $$
declare
  v_order bigint;
  v_pi text;
  v_total numeric;
  v_paid numeric;
begin
  select order_id, pi_no into v_order, v_pi from order_batches where id = p_batch;
  if v_order is null then raise exception 'That invoice was not found.'; end if;
  perform 1 from orders where id = v_order and status = 'APPROVED' for update;  -- one payment at a time per order
  if not found then raise exception 'Only approved orders take payments.'; end if;
  if v_pi is null then raise exception 'Make the PI first: payments are recorded against it.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'The amount must be above 0.'; end if;
  if p_date is null then raise exception 'Give the date the payment was received.'; end if;

  v_total := batch_invoice_total(p_batch);
  select coalesce(sum(amount), 0) into v_paid from payments where batch_id = p_batch;
  if v_paid + p_amount > v_total + 0.01 then
    raise exception 'That is more than the balance of % (SAR %): % of % is already paid.', v_pi, round(v_total - v_paid, 2), v_paid, v_total;
  end if;

  insert into payments (order_id, batch_id, amount, paid_on, method, reference, note, by_name)
  values (v_order, p_batch, round(p_amount, 2), p_date, coalesce(nullif(p_method, ''), 'Bank transfer'), nullif(p_ref, ''), nullif(p_note, ''), p_by);
  update order_batches set paid_full = (v_paid + p_amount >= v_total - 0.01) where id = p_batch;
  return case when v_paid + p_amount >= v_total - 0.01 then 'PAID' else 'PARTIAL' end;
end $$;

-- Take back a payment entered by mistake. Returns the PI's state after it: 'PAID', 'PARTIAL' or 'UNPAID'.
create or replace function delete_payment(p_payment bigint) returns text language plpgsql as $$
declare
  v_batch bigint;
  v_order bigint;
  v_total numeric;
  v_paid numeric;
begin
  select batch_id, order_id into v_batch, v_order from payments where id = p_payment;
  if v_batch is null then raise exception 'That payment was already removed.'; end if;
  perform 1 from orders where id = v_order for update;
  delete from payments where id = p_payment;
  v_total := batch_invoice_total(v_batch);
  select coalesce(sum(amount), 0) into v_paid from payments where batch_id = v_batch;
  update order_batches set paid_full = (v_paid > 0 and v_paid >= v_total - 0.01) where id = v_batch;
  return case when v_paid <= 0 then 'UNPAID' when v_paid >= v_total - 0.01 then 'PAID' else 'PARTIAL' end;
end $$;

-- 5. Order counts with payments (V 4). Same as migrate-014 plus batch_pay: a PI not yet paid in full.
create or replace function order_counts(p_salesperson uuid default null) returns json language sql stable as $$
  with o as (
    select o.*,
      exists (select 1 from order_batches b where b.order_id = o.id and b.do_date is not null and b.pi_no is null) as batch_pi,
      exists (select 1 from order_batches b where b.order_id = o.id and b.pi_no is not null and b.tax_invoice_path is null) as batch_tax,
      exists (select 1 from order_batches b where b.order_id = o.id and b.pi_no is not null and not b.paid_full) as batch_pay
    from orders o
    where p_salesperson is null or o.salesperson_id = p_salesperson
  )
  select json_build_object(
    'V',              4,
    'ALL',            count(*),
    'PENDING',        count(*) filter (where status = 'PENDING'),
    'APPROVED',       count(*) filter (where status = 'APPROVED'),
    'REJECTED',       count(*) filter (where status = 'REJECTED'),
    'CANCELLED',      count(*) filter (where status = 'CANCELLED'),
    'ACTIVE',         count(*) filter (where status = 'PENDING' or (status = 'APPROVED'
                        and (pi_date is null or do_date is null or tax_invoice_path is null
                             or dispatch_status in ('PENDING', 'PARTIAL') or batch_pi or batch_tax or batch_pay))),
    'AWAIT_DO',       count(*) filter (where status = 'APPROVED' and do_date is null),
    'AWAIT_DISPATCH', count(*) filter (where status = 'APPROVED' and dispatch_status in ('PENDING', 'PARTIAL')),
    'AWAIT_PI',       count(*) filter (where status = 'APPROVED' and ((do_date is not null and pi_date is null) or batch_pi)),
    'AWAIT_TAX',      count(*) filter (where status = 'APPROVED' and ((pi_date is not null and tax_invoice_path is null) or batch_tax)),
    'AWAIT_PAYMENT',  count(*) filter (where status = 'APPROVED' and batch_pay),
    'LINES',          (select count(*) from order_items i join orders x on x.id = i.order_id
                        where x.status = 'APPROVED' and x.dispatch_status is distinct from 'SHORT_CLOSED'
                          and i.qty > coalesce(i.dispatched_qty, 0))
  )
  from o
$$;

-- Only the server (service role) may call these.
revoke execute on function batch_invoice_total(bigint) from public, anon, authenticated;
revoke execute on function record_payment(bigint, numeric, date, text, text, text, text) from public, anon, authenticated;
revoke execute on function delete_payment(bigint) from public, anon, authenticated;
revoke execute on function order_counts(uuid) from public, anon, authenticated;
