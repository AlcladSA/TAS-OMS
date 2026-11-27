'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { PO_STATUS, day, money, plural, qty } from '@/lib/tas'
import POActions from './POActions'

export default function POTable({
  rows = [],
  listParams = {},
  listHref = '/inventory/po',
  me = {},
  term = '',
  show = 'open',
}) {
  const [expanded, setExpanded] = useState(() => new Set())

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    if (expanded.size === rows.length && rows.length > 0) {
      setExpanded(new Set())
    } else {
      setExpanded(new Set(rows.map((r) => r.id)))
    }
  }

  const viewHref = (id) =>
    `/inventory/po?${new URLSearchParams({ ...listParams, view: String(id) })}`
  const receiveHref = (id) =>
    `/inventory/po?${new URLSearchParams({ ...listParams, receive: String(id) })}`
  const qcHref = (grnId) =>
    `/inventory/po?${new URLSearchParams({ ...listParams, view_grn: String(grnId) })}`

  if (!rows.length) {
    return (
      <div className="empty">
        <i className="ph ph-shopping-cart" />
        <h3>No purchase orders here</h3>
        <p>{term ? `Nothing matches “${term}”.` : 'Create one with New PO.'}</p>
      </div>
    )
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="c-po" style={{ minWidth: 160 }}>
            <div className="d-flex ai-c gap-8">
              <button
                type="button"
                className="btn-caret"
                title={expanded.size === rows.length && rows.length > 0 ? 'Collapse all' : 'Expand all'}
                onClick={expandAll}
                aria-label="Toggle all rows"
              >
                <i className={`ph ${expanded.size === rows.length && rows.length > 0 ? 'ph-caret-down' : 'ph-caret-right'}`} />
              </button>
              <span>PO No</span>
            </div>
          </th>
          <th>Date</th>
          <th>Plant</th>
          <th>Vendor</th>
          <th className="r">Lines</th>
          <th className="r">Value (SAR)</th>
          <th className="r">Pending qty</th>
          <th>Status</th>
          <th className="r">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const isOpen = expanded.has(p.id)
          const [label, cls] = PO_STATUS[p.status] || ['Unknown', 'b-none']
          const items = p.items || []
          const totalVal = items.reduce((n, i) => n + Number(i.qty || 0) * Number(i.rate || 0), 0)
          const pendingTotal = items.reduce((n, i) => n + Math.max(0, Number(i.pending_qty || 0)), 0)
          const pendingQC = (p.grns || []).find((g) => g.status === 'QC_PENDING')
          const poData = {
            ...p,
            value: totalVal,
            pending_qty: pendingTotal,
          }

          return (
            <Fragment key={p.id}>
              <tr
                className={`clickable ${isOpen ? 'grp' : ''}`}
                onClick={(e) => {
                  if (!e.target.closest('a,button,input,select,textarea,label,dialog,.modal')) {
                    toggle(p.id)
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <td className="nowrap c-po">
                  <div className="d-flex ai-c gap-8">
                    <button
                      type="button"
                      className="btn-caret"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(p.id)
                      }}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse PO' : 'Expand PO'}
                    >
                      <i className={`ph ph-caret-${isOpen ? 'down' : 'right'}`} />
                    </button>
                    <Link
                      prefetch={false}
                      href={viewHref(p.id)}
                      scroll={false}
                      className="qno"
                      title="Open PO dialog"
                    >
                      {p.po_no}
                    </Link>
                  </div>
                </td>
                <td className="nowrap" data-label="Date">{day(p.po_date)}</td>
                <td data-label="Plant">{p.plant_code}</td>
                <td className="fw6" data-label="Vendor"><bdi>{p.vendor_name}</bdi></td>
                <td className="num" data-label="Lines">{items.length}</td>
                <td className="num" data-label="Value">{money(totalVal)}</td>
                <td className="num fw6" data-label="Pending qty">{qty(pendingTotal)}</td>
                <td className="nowrap" data-label="Status"><span className={`badge ${cls}`}>{label}</span></td>
                <td className="r nowrap" data-label="Actions">
                  <POActions
                    po={poData}
                    me={me}
                    back={listHref}
                    receiveHref={receiveHref(p.id)}
                    qcHref={pendingQC ? qcHref(pendingQC.id) : null}
                  />
                </td>
              </tr>

              {/* ── Collapsible Items Table ── */}
              {isOpen && (
                <tr className="expanded-row-details">
                  <td colSpan={9} style={{ padding: '0 0 14px 0', background: 'var(--fill-2)', borderBottom: '1px solid var(--border)' }}>
                    <div
                      style={{
                        margin: '8px 16px 0',
                        background: 'var(--card)',
                        borderRadius: 'var(--r-ctl)',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                        boxShadow: 'var(--shadow-1)',
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '8px',
                          borderBottom: '1px solid var(--border)',
                          background: 'var(--fill-2)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', flexWrap: 'wrap' }}>
                          <span className="fw6"><i className="ph ph-shopping-cart mr-4" />{p.po_no} Ordered Items</span>
                          <span className="muted">·</span>
                          <span className="muted">{plural(items.length, 'item')}</span>
                          <span className="muted">·</span>
                          <span className="fw6">Total: SAR {money(totalVal)}</span>
                          <span className="muted">·</span>
                          <span className="muted">Plant: {p.plant_code}</span>
                          {pendingTotal > 0 && (
                            <>
                              <span className="muted">·</span>
                              <span className="fw6" style={{ color: 'var(--warn-fg, #b45309)' }}>Pending: {qty(pendingTotal)}</span>
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Link
                            prefetch={false}
                            href={viewHref(p.id)}
                            scroll={false}
                            className="btn btn-ghost btn-xs"
                            title="Open full purchase order dialog"
                          >
                            <i className="ph ph-arrow-square-out" />Open dialog
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggle(p.id)
                            }}
                          >
                            <i className="ph ph-caret-up" />Collapse
                          </button>
                        </div>
                      </div>

                      <div className="tbl-wrap" style={{ borderTop: 'none', maxHeight: 'none' }}>
                        <table className="tbl tbl-sm" style={{ width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ width: 44 }}>#</th>
                              <th>Material</th>
                              <th>Code</th>
                              <th>UoM</th>
                              <th className="r">Ordered</th>
                              <th className="r">Rate (SAR)</th>
                              <th className="r">Amount (SAR)</th>
                              <th className="r">Pending</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, idx) => {
                              const pending = Math.max(0, Number(it.pending_qty || 0))
                              const amount = Number(it.qty || 0) * Number(it.rate || 0)
                              return (
                                <tr key={it.id || idx}>
                                  <td className="muted text-xs">{idx + 1}</td>
                                  <td>
                                    <span className="mat-name">{it.m?.name || '—'}</span>
                                  </td>
                                  <td>{it.m?.code || '—'}</td>
                                  <td>{it.m?.uom || '—'}</td>
                                  <td className="num fw6">{qty(it.qty)}</td>
                                  <td className="num">{money(it.rate)}</td>
                                  <td className="num fw6">{money(amount)}</td>
                                  <td
                                    className={`num${pending > 0 ? ' fw6' : ' muted'}`}
                                    style={{ color: pending > 0 ? 'var(--warn-fg, #b45309)' : undefined }}
                                  >
                                    {qty(pending)}
                                  </td>
                                </tr>
                              )
                            })}
                            {items.length === 0 && (
                              <tr>
                                <td colSpan={8} className="muted text-center" style={{ padding: '16px' }}>
                                  No items in this purchase order
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
