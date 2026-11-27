'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { day, qty, storeLabel } from '@/lib/tas'

export default function IssuesTable({ rows = [], q = '' }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const viewHref = (id) => `/inventory/issue?${new URLSearchParams({ ...(q && { q }), view: id })}`

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    if (expanded.size === rows.length) {
      setExpanded(new Set())
    } else {
      setExpanded(new Set(rows.map((r) => r.id)))
    }
  }

  if (!rows.length) {
    return (
      <div className="empty">
        <i className="ph ph-arrows-left-right" />
        <h3>No issues yet</h3>
        <p>Issue material from a store to a production line (a WIP store) with New issue.</p>
      </div>
    )
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 40, paddingRight: 0 }}>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-icon"
                title={expanded.size === rows.length ? 'Collapse all' : 'Expand all'}
                onClick={expandAll}
                aria-label="Toggle all rows"
              >
                <i className={`ph ${expanded.size === rows.length && rows.length > 0 ? 'ph-caret-down' : 'ph-caret-right'}`} />
              </button>
            </th>
            <th>Issue No</th>
            <th>Date</th>
            <th>From</th>
            <th>To</th>
            <th>Requested by</th>
            <th className="r">Lines</th>
            <th>Entered by</th>
            <th style={{ width: 48, textAlign: 'center' }}>Slip</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const isOpen = expanded.has(t.id)
            return (
              <Fragment key={t.id}>
                <tr
                  className={`clickable ${isOpen ? 'grp' : ''}`}
                  onClick={() => toggle(t.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ paddingRight: 0 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(t.id)
                      }}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse issue' : 'Expand issue'}
                    >
                      <i className={`ph ph-caret-${isOpen ? 'down' : 'right'} disc-caret`} />
                    </button>
                  </td>
                  <td className="nowrap">
                    <span className="qno">{t.doc_no}</span>
                  </td>
                  <td className="nowrap" data-label="Date">{day(t.doc_date)}</td>
                  <td data-label="From">{storeLabel(t.from)}</td>
                  <td className="fw6" data-label="To">{storeLabel(t.to)}</td>
                  <td data-label="Requested by">{t.requested_by || <span className="muted">—</span>}</td>
                  <td className="num" data-label="Lines">{t.items?.length ?? 0}</td>
                  <td data-label="Entered by">{t.by_name}</td>
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <Link
                      prefetch={false}
                      href={viewHref(t.id)}
                      className="btn btn-ghost btn-xs btn-icon"
                      title="View / Print Document"
                    >
                      <i className="ph ph-printer" />
                    </Link>
                  </td>
                </tr>

                {/* ── Collapsible Items Table ── */}
                {isOpen && (
                  <tr className="expanded-row-details">
                    <td colSpan={9} style={{ padding: '0 0 16px 0', background: 'var(--fill-2)', borderBottom: '1px solid var(--border)' }}>
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
                            <span className="fw6"><i className="ph ph-arrows-left-right mr-4" />{t.doc_no} Items</span>
                            <span className="muted">·</span>
                            <span className="muted">{storeLabel(t.from)} ➔ {storeLabel(t.to)}</span>
                            {t.notes && (
                              <>
                                <span className="muted">·</span>
                                <span className="badge b-info text-xs">{t.notes}</span>
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Link
                              prefetch={false}
                              href={viewHref(t.id)}
                              className="btn btn-ghost btn-xs btn-ic" title="Print or save as PDF" aria-label="Print or save as PDF">
                              <i className="ph ph-printer" />
                            </Link>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggle(t.id)
                              }}
                            >
                              <i className="ph ph-caret-up" />Collapse
                            </button>
                          </div>
                        </div>

                        <div className="tbl-wrap" style={{ borderTop: 'none', maxHeight: 'none' }}>
                          <table className="tbl" style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 44 }}>#</th>
                                <th>Material</th>
                                <th>Code</th>
                                <th>UoM</th>
                                <th className="r">Quantity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.items?.map((it, idx) => (
                                <tr key={it.id || idx}>
                                  <td className="muted text-xs">{idx + 1}</td>
                                  <td data-label="Material"><span className="mat-name">{it.m?.name}</span></td>
                                  <td data-label="Code"><span className="mat-sub">{it.m?.code}</span></td>
                                  <td data-label="UoM">{it.m?.uom}</td>
                                  <td className="num fw6" data-label="Quantity">{qty(it.qty)}</td>
                                </tr>
                              ))}
                              {!t.items?.length && (
                                <tr>
                                  <td colSpan={5} className="muted text-center" style={{ padding: '16px' }}>
                                    No item lines recorded for this issue.
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
    </div>
  )
}
