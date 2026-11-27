'use client'
import { useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Combobox } from '../ui'
import { money, qty } from '@/lib/tas'
import { autoIssuePlan } from './actions'

function IssueBtn({ disabled }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={disabled || pending}>
      {pending ? <span className="spin" /> : <i className="ph ph-magic-wand" />}
      {pending ? 'Issuing…' : 'Auto-issue RM to Line'}
    </button>
  )
}

const toInitialRows = (bomReqs) =>
  (bomReqs || []).map((r, i) => ({
    key: r.key || `bom-${i}`,
    material_id: r.id ? String(r.id) : '',
    formula_mat_id: r.id ? String(r.id) : '',
    formula_name: r.name || '',
    layer: r.layer || '',
    formula_qty: Number(r.total_qty) || 0,
    qty: r.total_qty != null ? String(r.total_qty) : '',
    uom: r.uom || 'KG',
    isExtra: false,
  }))

export default function PlanBomCard({ plan, m2, bomReqs = [], materials = [], stock = [], formId }) {
  const canEdit = plan.status === 'OPEN' && !(plan.issues?.length > 0)
  const [rows, setRows] = useState(() => toInitialRows(bomReqs))
  const nextKey = useRef(1)

  const matById = useMemo(
    () => new Map(materials.map((m) => [String(m.id), m])),
    [materials]
  )

  const rmOptions = useMemo(
    () => materials.map((m) => ({ value: String(m.id), label: m.name, badge: m.code, sub: m.uom })),
    [materials]
  )

  const stockByMat = useMemo(() => {
    const map = new Map()
    for (const s of stock || []) {
      const k = String(s.material_id)
      const prev = map.get(k) || { closing: 0, uom: s.uom, stores: [] }
      prev.closing += Number(s.closing || 0)
      prev.stores.push(`${s.store}: ${qty(s.closing)}`)
      map.set(k, prev)
    }
    return map
  }, [stock])

  const isModified = useMemo(() => {
    const init = toInitialRows(bomReqs)
    if (rows.length !== init.length) return true
    return rows.some((r, i) => {
      const b = init[i]
      return r.isExtra || r.material_id !== b.material_id || Number(r.qty) !== Number(b.qty)
    })
  }, [rows, bomReqs])

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const handleMaterialChange = (key, val) => {
    const m = matById.get(String(val))
    updateRow(key, {
      material_id: val,
      uom: m?.uom || 'KG',
    })
  }

  const addRow = () => {
    const key = `extra-${nextKey.current++}`
    setRows((prev) => [
      ...prev,
      {
        key,
        material_id: '',
        formula_mat_id: '',
        formula_name: '',
        layer: 'Added for this plan',
        formula_qty: 0,
        qty: '',
        uom: 'KG',
        isExtra: true,
      },
    ])
  }

  const removeRow = (key) => {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  const resetToBom = () => {
    setRows(toInitialRows(bomReqs))
  }

  const validRows = rows.filter((r) => r.material_id && Number(r.qty) > 0)
  const canSubmit = rows.length > 0 && validRows.length === rows.length

  if (!canEdit && bomReqs.length === 0) return null

  // Read-only view once RM is issued or plan is done
  if (!canEdit) {
    const issuedMap = new Map()
    for (const iss of plan.issues || []) {
      for (const it of iss.items || []) {
        const k = String(it.material_id)
        const prev = issuedMap.get(k) || { qty: 0, m: it.m }
        prev.qty += Number(it.qty || 0)
        issuedMap.set(k, prev)
      }
    }
    const hasIssuedItems = issuedMap.size > 0
    const extraIssued = [...issuedMap.entries()]
      .filter(([mid]) => !bomReqs.some((r) => String(r.id) === mid))
      .map(([mid, v]) => ({ id: mid, name: v.m?.name || mid, code: v.m?.code || '—', layer: 'Added for this plan', total_qty: 0, uom: v.m?.uom || 'KG', issued: v.qty }))
    const viewRows = [...bomReqs.map((r) => ({ ...r, issued: r.id ? (issuedMap.get(String(r.id))?.qty || 0) : 0 })), ...extraIssued]

    return (
      <div className="card" style={{ marginTop: 16, border: '1px solid var(--border)' }}>
        <div className="tbl-top">
          <h2 className="tbl-ttl">
            <i className="ph ph-receipt" />BOM Required Raw Material <span className="badge b-none">{money(m2)} M²</span>
          </h2>
          {plan.issues?.length > 0 && (
            <span className="badge b-ok">
              <i className="ph ph-check" />RM Issued: {plan.issues.map((i) => i.doc_no).join(', ')}
            </span>
          )}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Required Material</th>
                <th>Layer Spec</th>
                <th className="r">Formula Needed</th>
                {hasIssuedItems && <th className="r">Issued for Plan</th>}
                <th className="r">Plant Stock Today</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.map((req, idx) => {
                const st = req.id ? stockByMat.get(String(req.id)) : null
                const stockQty = st?.closing || 0
                const isEnough = stockQty >= req.total_qty
                return (
                  <tr key={idx}>
                    <td data-label="Material">
                      <span className="mat-name">{req.name}</span>
                      {req.code && req.code !== '—' && <span className="mat-sub">{req.code}</span>}
                    </td>
                    <td data-label="Layer Spec">
                      <span className="text-xs muted">{req.layer}</span>
                    </td>
                    <td className="num fw7" data-label="Formula Needed" style={{ color: 'var(--text)' }}>
                      {req.total_qty > 0 ? `${qty(req.total_qty)} ${req.uom}` : <span className="muted">—</span>}
                    </td>
                    {hasIssuedItems && (
                      <td className="num fw6" data-label="Issued for Plan">
                        {req.issued > 0 ? `${qty(req.issued)} ${req.uom}` : <span className="muted">Removed</span>}
                      </td>
                    )}
                    <td className="num fw6" data-label="Plant Stock Today" title={st?.stores?.join(' · ') || undefined}>
                      {st ? `${qty(stockQty)} ${st.uom}` : <span className="muted">0 {req.uom}</span>}
                    </td>
                    <td data-label="Status">
                      {hasIssuedItems && req.issued > 0 ? (
                        <span className="badge b-ok">Issued</span>
                      ) : hasIssuedItems && req.issued === 0 ? (
                        <span className="badge b-none">Skipped</span>
                      ) : isEnough ? (
                        <span className="badge b-ok">Available</span>
                      ) : (
                        <span className="badge b-danger">Shortage: -{qty(req.total_qty - stockQty)} {req.uom}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <form
      id={formId}
      action={autoIssuePlan.bind(null, plan.id)}
      className="card"
      style={{ marginTop: 16, border: '1px solid var(--border)' }}
    >
      <input type="hidden" name="rm_custom" value="1" />
      <div className="tbl-top">
        <div className="d-flex ai-c gap-8 f-wrap">
          <h2 className="tbl-ttl m-0">
            <i className="ph ph-receipt" />BOM Required Raw Material <span className="badge b-none">{money(m2)} M²</span>
          </h2>
          {isModified && (
            <span className="badge b-warn">Custom for this plan</span>
          )}
        </div>
        <div className="d-flex ai-c gap-8 f-wrap">
          {isModified && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetToBom} title="Restore default BOM formula materials">
              <i className="ph ph-arrow-counter-clockwise" />Reset to BOM
            </button>
          )}
          <IssueBtn disabled={!canSubmit} />
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 260 }}>Required Material</th>
              <th>Layer Spec</th>
              <th className="r" style={{ width: 145 }}>Qty to Issue</th>
              <th className="r">Plant Stock Today</th>
              <th>Status</th>
              <th style={{ width: 40 }}><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = r.material_id ? stockByMat.get(String(r.material_id)) : null
              const stockQty = st?.closing || 0
              const needed = Number(r.qty) || 0
              const isEnough = Boolean(r.material_id) && stockQty >= needed
              const swapped = !r.isExtra && r.formula_mat_id && r.material_id !== r.formula_mat_id

              return (
                <tr key={r.key}>
                  <td data-label="Material">
                    <Combobox
                      name="rm_material"
                      value={r.material_id}
                      options={rmOptions}
                      placeholder="Select raw material…"
                      required
                      requiredMsg="Pick a raw material or remove the row."
                      wide
                      onChange={(v) => handleMaterialChange(r.key, v)}
                    />
                    {swapped && r.formula_name && (
                      <span className="mat-sub">Formula: {r.formula_name}</span>
                    )}
                  </td>
                  <td data-label="Layer Spec">
                    <span className="text-xs muted">{r.layer}</span>
                    {r.formula_qty > 0 && (
                      <span className="cell-sub">Formula: {qty(r.formula_qty)} {r.uom}</span>
                    )}
                  </td>
                  <td className="num" data-label="Qty to Issue">
                    <div className="d-flex ai-c gap-4" style={{ justifyContent: 'flex-end' }}>
                      <input
                        name="rm_qty"
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        step="any"
                        value={r.qty}
                        onChange={(e) => updateRow(r.key, { qty: e.target.value })}
                        required
                        aria-label={`Quantity to issue for ${r.layer}`}
                        style={{ width: 92, textAlign: 'right', fontWeight: 600 }}
                      />
                      <span className="muted text-xs" style={{ minWidth: 24, textAlign: 'left' }}>{r.uom}</span>
                    </div>
                  </td>
                  <td className="num fw6" data-label="Plant Stock Today" title={st?.stores?.join(' · ') || undefined}>
                    {r.material_id ? (
                      st ? `${qty(stockQty)} ${st.uom}` : <span className="muted">0 {r.uom}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td data-label="Status">
                    {!r.material_id ? (
                      <span className="badge b-warn">Pick material</span>
                    ) : needed <= 0 ? (
                      <span className="badge b-warn">Enter qty</span>
                    ) : isEnough ? (
                      <span className="badge b-ok">Available</span>
                    ) : (
                      <span className="badge b-danger">Shortage: -{qty(needed - stockQty)} {r.uom}</span>
                    )}
                  </td>
                  <td data-label="">
                    <button
                      type="button"
                      className="btn-link danger"
                      onClick={() => removeRow(r.key)}
                      title="Remove RM for this plan only"
                      aria-label={`Remove ${r.layer}`}
                    >
                      <i className="ph ph-trash" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="c muted" style={{ padding: '20px 16px' }}>
                  No raw materials selected for this plan. Press <b>Add RM</b> or <b>Reset to BOM</b>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="tbl-foot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
          <i className="ph ph-plus" />Add RM
        </button>
        <span className="muted text-xs">
          Changes only affect this plan&apos;s issue — the BOM formula &amp; recipes stay unchanged.
        </span>
      </div>
    </form>
  )
}
