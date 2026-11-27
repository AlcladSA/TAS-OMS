-- Clears the sample transactions so the app starts empty. Run once in the Supabase SQL Editor.
-- CLEARED: orders (lines, DO/PI batches, dispatches), activity log, production plans, DPRs, QC,
--          RM issues, stock and FG stock moves, POs, GRNs, and the PO/GRN/PLN/DPR/ISS number counters.
-- KEPT:    users, company settings, customers, vendors, plants, stores, materials, item master,
--          finished-goods items, BOM recipes and core settings.
-- Quote, DO and PI numbers follow the orders, so they start again at 001 too.
-- No CASCADE: if any table outside this list points at these rows, the whole thing stops instead.
-- Tax invoice files already uploaded stay in Google Drive.
begin;
truncate table
  batch_items, dispatches, order_batches, order_items, order_events, orders,
  production_consumptions, production_items, productions, plan_items, production_plans,
  transfer_items, transfers, stock_moves, fg_moves,
  grn_items, grns, po_items, purchase_orders,
  inv_counters
restart identity;
commit;

-- Check: every count should be 0.
select (select count(*) from orders) orders, (select count(*) from order_events) activity,
       (select count(*) from production_plans) plans, (select count(*) from purchase_orders) pos,
       (select count(*) from stock_moves) stock, (select count(*) from fg_moves) fg_stock,
       (select count(*) from customers) customers_kept, (select count(*) from materials) materials_kept;
