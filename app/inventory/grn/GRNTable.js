'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { day, plural, qty } from '@/lib/tas'

export default function GRNTable({ rows = [], listParams = {}, term = '', show = 'pending' }) {
  const [expanded, setExpanded] = useState(() => new Set())

  const viewGrnHref = (id) =>
    `/inventory/po?${new URLSearchParams({ ...listParams, tab: 'grn', view_grn: String(id) })}`

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

  if (!rows.length) {
    return (
      <div className="empty">
        <i className="ph ph-truck" />
        <h3>No goods received records</h3>
        <p>{term ? `Nothing matches "${term}".` : show !== 'all' ? 'No goods currently waiting for QC inspection.' : 'No goods received yet.'}</p>
      </div>
    )
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="c-grn" style={{ minWidth: 160 }}>
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
              <span>GRN No</span>
            </div>
          </th>
          <th>Date</th>
          <th>PO</th>
          <th>Vendor</th>
          <th>Store</th>
          <th>Invoice</th>
          <th className="r">Lines</th>
          <th>QC Status</th>
          <th className="r">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => {
          const isOpen = expanded.has(g.id)
          const items = g.items || []
          return (
            <Fragment key={g.id}>
              <tr
                className={`clickable ${isOpen ? 'grp' : ''}`}
                onClick={(e) => {
                  if (!e.target.closest('a,button,input,select,textarea,label,dialog')) {
                    toggle(g.id)
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <td className="nowrap c-grn">
                  <div className="d-flex ai-c gap-8">
                    <button
                      type="button"
                      className="btn-caret"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(g.id)
                      }}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse receipt' : 'Expand receipt'}
                    >
                      <i className={`ph ph-caret-${isOpen ? 'down' : 'right'}`} />
                    </button>
                    <Link
                      prefetch={false}
                      className="qno"
                      href={viewGrnHref(g.id)}
                      scroll={false}
                      title="Open receipt dialog"
                    >
                      {g.grn_no}
                    </Link>
                  </div>
                </td>
                <td className="nowrap" data-label="Date">{day(g.grn_date)}</td>
                <td className="nowrap" data-label="PO">
                  {g.po?.po_no ? (
                    <Link
                      prefetch={false}
                      href={`/inventory/po?view=${g.po?.id || g.po_id}`}
                      className="qno"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {g.po?.po_no}
                    </Link>
                  ) : '—'}
                </td>
                <td className="fw6" data-label="Vendor"><bdi>{g.po?.vendor_name || '—'}</bdi></td>
                <td data-label="Store">
                  {g.store?.name} <span className="muted">{g.store?.plant_code}</span>
                </td>
                <td data-label="Invoice">{g.invoice_no || <span className="muted">—</span>}</td>
                <td className="num" data-label="Lines">{items.length}</td>
                <td className="nowrap" data-label="QC">
                  {g.status === 'DONE' ? (
                    <span className="badge b-ok">Done</span>
                  ) : (
                    <span className="badge b-warn">Waiting check</span>
                  )}
                </td>
                <td className="r nowrap" data-label="Actions">
                  <div className="row-acts">
                    {g.status !== 'DONE' ? (
                      <Link
                        prefetch={false}
                        href={viewGrnHref(g.id)}
                        scroll={false}
                        className="btn btn-warn btn-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <i className="ph ph-seal-check" />Check (QC)
                      </Link>
                    ) : (
                      <span className="badge b-ok"><i className="ph ph-check" />Done</span>
                    )}
                  </div>
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
                          <span className="fw6"><i className="ph ph-package mr-4" />{g.grn_no} Received Items</span>
                          <span className="muted">·</span>
                          <span className="muted">{plural(items.length, 'item')}</span>
                          {g.store?.name && (
                            <>
                              <span className="muted">·</span>
                              <span className="muted">Store: {g.store.name}</span>
                            </>
                          )}
                          {g.po?.po_no && (
                            <>
                              <span className="muted">·</span>
                              <span className="muted">PO: {g.po.po_no}</span>
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Link
                            prefetch={false}
                            href={viewGrnHref(g.id)}
                            scroll={false}
                            className="btn btn-ghost btn-xs"
                            title="Open full receipt dialog"
                          >
                            <i className="ph ph-arrow-square-out" />Open dialog
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggle(g.id)
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
                              <th className="r">Received</th>
                              <th className="r">Accepted</th>
                              <th className="r">Rejected</th>
                              <th>QC Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, idx) => (
                              <tr key={it.id || idx}>
                                <td className="muted text-xs">{idx + 1}</td>
                                <td>
                                  <span className="mat-name">{it.m?.name || '—'}</span>
                                </td>
                                <td>{it.m?.code || '—'}</td>
                                <td>{it.m?.uom || '—'}</td>
                                <td className="num fw6">{qty(it.qty)}</td>
                                <td className="num fw6" style={{ color: 'var(--btn-ok)' }}>
                                  {g.status === 'DONE' ? qty(it.accepted_qty ?? it.qty) : '—'}
                                </td>
                                <td className={`num${(it.rejected_qty || 0) > 0 ? ' red fw6' : ' muted'}`}>
                                  {g.status === 'DONE' ? ((it.rejected_qty || 0) > 0 ? qty(it.rejected_qty) : 0) : '—'}
                                </td>
                                <td>{it.qc_remarks || <span className="muted">—</span>}</td>
                              </tr>
                            ))}
                            {items.length === 0 && (
                              <tr>
                                <td colSpan={8} className="muted text-center" style={{ padding: '16px' }}>
                                  No items in this receipt
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
