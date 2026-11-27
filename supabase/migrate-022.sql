-- Shift output (DPR): scrap that comes off the line, kept apart from extra raw material use, and rejected
-- pieces cut to another size. Run once in the Supabase SQL Editor; safe to run again.
--
-- 1. Scrap materials, so the Scrap Yard (a store of type SCRAP) can hold stock.
-- 2. production_wastage: what each DPR recorded per scrap type (expected from the BOM, actual weighed).
-- 3. stock_moves ref_type 'SCRAP': the weighed kg goes into the plant's SCRAP store with the DPR.
-- 4. production_items.reject_width / reject_length: a rejected row cut to another size than its product.
-- 5. create_production gets p_wastage. The 4-argument version is dropped first: with both in place every
--    4-argument call would match two functions and fail with "function create_production is not unique".

-- 1. Scrap materials (KG). Codes are fixed so the app can default each scrap type to its material.
insert into materials (code, name, category, kind, uom)
select v.code, v.name, 'SCRAP', 'OTHER', 'KG'
  from (values ('SCRAP-ALU', 'Aluminium scrap (side trim / process)'),
               ('SCRAP-CORE', 'Core / plastic waste'),
               ('SCRAP-PANEL', 'Mixed panel scrap (rejected panels)')) v (code, name)
 where not exists (select 1 from materials m where m.code = v.code);

-- 2. Scrap recorded on a DPR
create table if not exists production_wastage (
  id            bigint generated always as identity primary key,
  production_id bigint not null references productions on delete cascade,
  scrap_type    text not null check (scrap_type in ('ALU_TRIM', 'ALU_PROCESS', 'CORE_WASTE', 'PANEL_REJECT', 'OTHER')),
  material_id   bigint not null references materials,
  expected_kg   numeric not null default 0 check (expected_kg >= 0),
  actual_kg     numeric not null check (actual_kg > 0),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists production_wastage_prod_idx on production_wastage (production_id);
alter table production_wastage enable row level security; -- no policies: only the server (service role) reads it

-- 3. Scrap posted into the Scrap Yard
alter table stock_moves drop constraint if exists stock_moves_ref_type_check;
alter table stock_moves add constraint stock_moves_ref_type_check
  check (ref_type in ('OPENING', 'ADJUST', 'GRN', 'ISSUE', 'USE', 'SCRAP'));

-- 4. Rejected pieces of another size (mm). Empty = the product's own size.
alter table production_items add column if not exists reject_width numeric check (reject_width > 0);
alter table production_items add column if not exists reject_length numeric check (reject_length > 0);

-- 5. create_production with scrap. Same as migrate-020, plus reject sizes on the items and section 2d.
drop function if exists create_production(jsonb, jsonb, jsonb, jsonb);
create or replace function create_production(p_head jsonb, p_items jsonb, p_usage jsonb, p_consumption jsonb default '[]'::jsonb, p_wastage jsonb default '[]'::jsonb)
returns text language plpgsql as $$
declare
  v_id bigint;
  v_no text;
  v_line bigint := (p_head->>'line')::bigint;
  v_date date := (p_head->>'date')::date;
  v_allow_neg boolean := coalesce((p_head->>'allow_negative')::boolean, false);
  v_stock_keys jsonb := '[]'::jsonb;
  v_rm_store bigint;
  v_scrap_store bigint;
  v_transfer_id bigint;
  v_iss_no text;
  v_needed_keys jsonb := '[]'::jsonb;
  rec record;
  v_curr_stock numeric;
  v_shortfall numeric;
begin
  perform 1 from stores where id = v_line and type = 'WIP';
  if not found then raise exception 'Pick a production line (a WIP store).'; end if;
  perform lock_stock();

  -- Find the Main RM store for this line's plant
  select s.id into v_rm_store
    from stores s
   where s.plant_code = (select plant_code from stores where id = v_line)
     and s.type = 'RM'
   order by s.id asc
   limit 1;

  insert into productions (prod_date, shift, line_store_id, plan_id, operator, notes, by_name)
  values (v_date, p_head->>'shift', v_line, nullif(p_head->>'plan', '')::bigint, nullif(p_head->>'operator', ''), nullif(p_head->>'notes', ''), p_head->>'by')
  returning id, dpr_no into v_id, v_no;

  insert into production_items (production_id, plan_item_id, fg_item_id, good_qty, rejected_qty, reject_reason, reject_width, reject_length)
  select v_id, nullif(l->>'plan_item', '')::bigint, (l->>'item')::bigint, coalesce((l->>'good')::numeric, 0),
         coalesce((l->>'rejected')::numeric, 0), nullif(l->>'reason', ''),
         nullif(l->>'reject_width', '')::numeric, nullif(l->>'reject_length', '')::numeric
    from jsonb_array_elements(p_items) l;

  update plan_items pi set produced_qty = pi.produced_qty + coalesce((l->>'good')::numeric, 0)
    from jsonb_array_elements(p_items) l where pi.id = nullif(l->>'plan_item', '')::bigint;

  update production_plans pp set status = 'DONE'
   where pp.id in (select plan_id from plan_items where id in (select nullif(l->>'plan_item', '')::bigint from jsonb_array_elements(p_items) l))
     and not exists (select 1 from plan_items pi where pi.plan_id = pp.id and pi.produced_qty < pi.qty);

  -- 2a. Record detailed consumption with System vs Actual
  if jsonb_array_length(coalesce(p_consumption, '[]'::jsonb)) > 0 then
    insert into production_consumptions (
      production_id, layer_type, material_id, suggested_mat_id, system_qty, actual_qty, uom, reason, settings_snapshot
    )
    select v_id,
           c->>'layer_type',
           (c->>'material_id')::bigint,
           nullif(c->>'suggested_mat_id', '')::bigint,
           coalesce((c->>'system_qty')::numeric, 0),
           coalesce((c->>'actual_qty')::numeric, 0),
           coalesce(c->>'uom', 'KG'),
           nullif(c->>'reason', ''),
           c->'settings_snapshot'
      from jsonb_array_elements(p_consumption) c;

    -- Auto-issue from RM store to line store for any consumed material that is short on the line
    if v_rm_store is not null then
      for rec in
        select (c->>'material_id')::bigint as mat_id,
               sum(coalesce((c->>'actual_qty')::numeric, 0)) as act_qty
          from jsonb_array_elements(p_consumption) c
         where coalesce((c->>'actual_qty')::numeric, 0) > 0
         group by 1
      loop
        select coalesce(sum(qty), 0) into v_curr_stock
          from stock_moves
         where store_id = v_line and material_id = rec.mat_id;

        if v_curr_stock < rec.act_qty then
          v_shortfall := rec.act_qty - v_curr_stock;
          if v_transfer_id is null then
            v_iss_no := next_inv_no('ISS');
            insert into transfers (doc_no, doc_date, from_store_id, to_store_id, requested_by, notes, by_name, plan_id)
            values (v_iss_no, v_date, v_rm_store, v_line, 'Auto-issue (DPR)', 'Auto-issued for DPR ' || v_no, p_head->>'by', nullif(p_head->>'plan', '')::bigint)
            returning id into v_transfer_id;
          end if;

          insert into transfer_items (transfer_id, material_id, qty)
          values (v_transfer_id, rec.mat_id, v_shortfall);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_rm_store, rec.mat_id, -v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-issued to line for ' || v_no);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_line, rec.mat_id, v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-received on line for ' || v_no);

          v_needed_keys := v_needed_keys || jsonb_build_object('store', v_rm_store, 'material', rec.mat_id);
        end if;
      end loop;

      if not v_allow_neg and jsonb_array_length(v_needed_keys) > 0 then
        perform check_stock(v_needed_keys);
      end if;
    end if;

    -- Deduct actual quantities from the line store
    insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
    select v_date, v_line, (c->>'material_id')::bigint, -coalesce((c->>'actual_qty')::numeric, 0), 'USE', v_no, p_head->>'by'
      from jsonb_array_elements(p_consumption) c
     where coalesce((c->>'actual_qty')::numeric, 0) > 0;

    v_stock_keys := (
      select jsonb_agg(jsonb_build_object('store', v_line, 'material', c->>'material_id'))
        from jsonb_array_elements(p_consumption) c
       where coalesce((c->>'actual_qty')::numeric, 0) > 0
    );

  -- 2b. Fallback to legacy p_usage if p_consumption not provided
  elsif jsonb_array_length(coalesce(p_usage, '[]'::jsonb)) > 0 then
    if v_rm_store is not null then
      for rec in
        select (u->>'material')::bigint as mat_id,
               sum(coalesce((u->>'qty')::numeric, 0)) as act_qty
          from jsonb_array_elements(p_usage) u
         where coalesce((u->>'qty')::numeric, 0) > 0
         group by 1
      loop
        select coalesce(sum(qty), 0) into v_curr_stock
          from stock_moves
         where store_id = v_line and material_id = rec.mat_id;

        if v_curr_stock < rec.act_qty then
          v_shortfall := rec.act_qty - v_curr_stock;
          if v_transfer_id is null then
            v_iss_no := next_inv_no('ISS');
            insert into transfers (doc_no, doc_date, from_store_id, to_store_id, requested_by, notes, by_name, plan_id)
            values (v_iss_no, v_date, v_rm_store, v_line, 'Auto-issue (DPR)', 'Auto-issued for DPR ' || v_no, p_head->>'by', nullif(p_head->>'plan', '')::bigint)
            returning id into v_transfer_id;
          end if;

          insert into transfer_items (transfer_id, material_id, qty)
          values (v_transfer_id, rec.mat_id, v_shortfall);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_rm_store, rec.mat_id, -v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-issued to line for ' || v_no);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_line, rec.mat_id, v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-received on line for ' || v_no);

          v_needed_keys := v_needed_keys || jsonb_build_object('store', v_rm_store, 'material', rec.mat_id);
        end if;
      end loop;

      if not v_allow_neg and jsonb_array_length(v_needed_keys) > 0 then
        perform check_stock(v_needed_keys);
      end if;
    end if;

    insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
    select v_date, v_line, (u->>'material')::bigint, -(u->>'qty')::numeric, 'USE', v_no, p_head->>'by'
      from jsonb_array_elements(p_usage) u
     where coalesce((u->>'qty')::numeric, 0) > 0;

    v_stock_keys := (
      select jsonb_agg(jsonb_build_object('store', v_line, 'material', u->>'material'))
        from jsonb_array_elements(p_usage) u
       where coalesce((u->>'qty')::numeric, 0) > 0
    );
  end if;

  -- 2c. Validate stock on the line
  if not v_allow_neg and v_stock_keys is not null and jsonb_array_length(v_stock_keys) > 0 then
    perform check_stock(v_stock_keys);
  end if;

  -- 2d. Scrap weighed off the line: recorded on the DPR and put into the plant's Scrap Yard (stock goes up).
  -- Without a SCRAP store the DPR is refused rather than losing the kg without a trace.
  if jsonb_array_length(coalesce(p_wastage, '[]'::jsonb)) > 0 then
    select s.id into v_scrap_store
      from stores s
     where s.plant_code = (select plant_code from stores where id = v_line)
       and s.type = 'SCRAP'
     order by s.id asc
     limit 1;
    if v_scrap_store is null then
      raise exception 'This plant has no Scrap store yet: add one under Settings -> Stores (type SCRAP), or leave the scrap empty.';
    end if;
    if exists (select 1 from jsonb_array_elements(p_wastage) w
                left join materials m on m.id = (w->>'material_id')::bigint
               where m.id is null or m.category <> 'SCRAP' or coalesce((w->>'actual_kg')::numeric, 0) <= 0) then
      raise exception 'Each scrap line needs a scrap material and a weight above 0 kg.';
    end if;

    insert into production_wastage (production_id, scrap_type, material_id, expected_kg, actual_kg, note)
    select v_id, coalesce(nullif(w->>'scrap_type', ''), 'OTHER'), (w->>'material_id')::bigint,
           greatest(coalesce((w->>'expected_kg')::numeric, 0), 0), (w->>'actual_kg')::numeric, nullif(w->>'note', '')
      from jsonb_array_elements(p_wastage) w;

    insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
    select v_date, v_scrap_store, (w->>'material_id')::bigint, sum((w->>'actual_kg')::numeric), 'SCRAP', v_no, p_head->>'by', 'Scrap from ' || v_no
      from jsonb_array_elements(p_wastage) w
     group by (w->>'material_id')::bigint;
  end if;

  return v_no;
end $$;

-- Only the server (service role) may call it, like every other stock function.
revoke execute on function create_production(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
