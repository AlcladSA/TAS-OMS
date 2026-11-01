'use client'
import { Fragment, useState, useEffect, useOptimistic, useRef } from 'react'
import Link from 'next/link'
import { DISPATCH, STATUS, actionData, day, int, money, plural, totals, describe } from '@/lib/tas'
import { ClickRow, CustName, DocsMenu, LinkBusy } from '../ui'
import OrderDialog from './OrderDialog'
import OrderActions from './OrderActions'
// Details come from a GET route, not a Server Action, so a slow server never blocks the dialog.
const loadOrderDetail = (id) => fetch(`/orders/${id}/detail`).then((r) => (r.ok ? r.json() : null)).catch(() => null)

// Client-rendered table view that enables instant (16 ms) order dialog opening from row data
// without full page server round-trips. History loads asynchronously in the background.
export default function OrdersView({
  rows,
  initialView,
  initialHistory,
  me,
  listHref,
  openBatchPi,
  sort,
  term,
  sortHrefs = {},
  SORTS,
}) {
  const [activeOrder, setActiveOrder] = useState(initialView || null)
  const [history, setHistory] = useState(initialHistory || null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [orders, setOrders] = useState(rows || [])
  const [expanded, setExpanded] = useState(() => new Set())
  const openId = useRef(initialView?.id ?? null) // drops late details meant for an order already closed

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    if (expanded.size === (optimisticRows || []).length && (optimisticRows || []).length > 0) {
      setExpanded(new Set())
    } else {
      setExpanded(new Set((optimisticRows || []).map((o) => o.id)))
    }
  }

  const viewHref = (id) => `${listHref}${listHref.includes('?') ? '&' : '?'}view=${id}`
  const getSortHref = (next) => sortHrefs[next] || `${listHref}${listHref.includes('?') ? '&' : '?'}sort=${next}`

  useEffect(() => {
    setOrders(rows || [])
  }, [rows])

  const [optimisticRows, setOptimisticRows] = useOptimistic(
    orders,
    (state, update) => {
      if (update.type === 'APPROVE') {
        return state.map((o) => (o.id === update.id ? { ...o, status: 'APPROVED', dispatch_status: 'PENDING', _optimistic: true } : o))
      }
      if (update.type === 'REJECT') {
        return state.map((o) => (o.id === update.id ? { ...o, status: 'REJECTED', _optimistic: true } : o))
      }
      return state
    }
  )

  const handleAction = (id, type) => {
    setOptimisticRows({ id, type })
  }

  // Sync state if initialView changes from server navigation
  useEffect(() => {
    if (initialView) {
      openId.current = initialView.id
      setActiveOrder(initialView)
      setHistory(initialHistory || null)
    }
  }, [initialView, initialHistory])

  // Sync with browser Back / Forward buttons (popstate)
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search)
      const v = sp.get('view')
      if (!v) {
        openId.current = null
        setActiveOrder(null)
        setHistory(null)
        return
      }
      const match = rows?.find((r) => String(r.id) === String(v))
      if (match) {
        openOrder(match, false)
      } else {
        openId.current = v
        loadOrderDetail(v).then((res) => {
          if (res?.order && String(openId.current) === String(v)) {
            setActiveOrder(res.order)
            setHistory(res.history)
          }
        })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [rows])

  const openOrder = (order, push = true) => {
    openId.current = order.id
    setActiveOrder(order)
    setHistory(null)
    setHistoryLoading(true)
    if (push) {
      const url = viewHref(order.id)
      window.history.pushState(null, '', url)
    }
    loadOrderDetail(order.id)
      .then((res) => {
        if (openId.current !== order.id) return
        if (res?.history) setHistory(res.history)
        if (res?.order) {
          setActiveOrder((prev) => (prev?.id === res.order.id ? { ...prev, ...res.order } : prev))
        }
        setHistoryLoading(false)
      })
      .catch(() => setHistoryLoading(false))
  }

  const closeOrder = () => {
    openId.current = null
    setActiveOrder(null)
    setHistory(null)
    window.history.pushState(null, '', listHref)
  }

  const SortTh = ({ label, up, down, cls }) => {
    const on = sort === up || sort === down
    const next = sort === down ? up : down
    return (
      <th className={cls} aria-sort={on ? (SORTS[sort][1] ? 'ascending' : 'descending') : 'none'}>
        <Link prefetch={false} href={getSortHref(next)} className="th-sort">
          <LinkBusy />{label}<i className={`ph ${on ? (SORTS[sort][1] ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`} aria-hidden="true" />
        </Link>
      </th>
    )
  }

  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl orders-tbl">
          <thead>
            <tr>
              <th className="c-q" aria-sort={sort === 'oldest' || sort === 'newest' ? (SORTS[sort]?.[1] ? 'ascending' : 'descending') : 'none'}>
                <div className="d-flex ai-c gap-8">
                  <button
                    type="button"
                    className="btn-caret"
                    title={expanded.size === (optimisticRows || []).length && (optimisticRows || []).length > 0 ? 'Collapse all' : 'Expand all'}
                    onClick={expandAll}
                    aria-label="Toggle all rows"
                  >
                    <i className={`ph ${expanded.size === (optimisticRows || []).length && (optimisticRows || []).length > 0 ? 'ph-caret-down' : 'ph-caret-right'}`} />
                  </button>
                  <Link prefetch={false} href={getSortHref(sort === 'newest' ? 'oldest' : 'newest')} className="th-sort">
                    <LinkBusy />Quote No<i className={`ph ${sort === 'oldest' || sort === 'newest' ? (SORTS[sort]?.[1] ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`} aria-hidden="true" />
                  </Link>
                </div>
              </th>
              <SortTh label="Customer" up="customer" down="customer_desc" cls="c-cust" />
              <th className="c-st">Status</th>
              <th className="r c-tot">Total (SAR)</th>
              <th className="c-docs">Documents</th>
              <th className="c-date">Date</th>
              <th className="c-sp">Salesperson</th>
              <th className="r c-act">Actions</th>
            </tr>
          </thead>
          <tbody>
            {optimisticRows?.map((o) => {
              const pcs = (o.items || []).reduce((n, it) => n + Number(it.qty || 0), 0)
              const bs = o.batches || []
              const d = actionData(o)
              const isOpen = expanded.has(o.id)
              return (
                <Fragment key={o.id}>
                  <tr
                    className={`clickable ${isOpen ? 'grp' : ''}`}
                    onClick={(e) => {
                      if (!e.target.closest('a,button,input,select,textarea,label,dialog,.dl-menu')) {
                        toggle(o.id)
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="nowrap c-q">
                      <div className="d-flex ai-c gap-8">
                        <button
                          type="button"
                          className="btn-caret"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggle(o.id)
                          }}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse order' : 'Expand order'}
                        >
                          <i className={`ph ph-caret-${isOpen ? 'down' : 'right'}`} />
                        </button>
                        <Link
                          prefetch={false}
                          href={viewHref(o.id)}
                          scroll={false}
                          className="qno"
                          onClick={(e) => {
                            e.stopPropagation()
                            openOrder(o)
                          }}
                          title="Open order dialog"
                        >
                          {o.quote_no}
                        </Link>
                      </div>
                    </td>
                    <td className="c-cust"><CustName name={o.customer_name} className="cust-name" /></td>
                    <td className="nowrap c-st">
                      {o.status === 'APPROVED' && DISPATCH[o.dispatch_status]
                        ? <span className={`badge ${DISPATCH[o.dispatch_status][1]}`}>{DISPATCH[o.dispatch_status][0]}</span>
                        : <span className={`badge b-${o.status}`}>{STATUS[o.status] || o.status}</span>}
                    </td>
                    <td className="num c-tot"><span className="fw6">{money(totals(o.items, o.transport, o.vat_rate).total)}</span><span className="cell-sub">{int(pcs)} PCS</span></td>
                    <td className="c-docs">
                      <DocsMenu o={d} />
                      <span className="cell-sub doc-ref">{bs.length === 1 ? bs[0].do_no : bs.length ? plural(bs.length, 'DO') : o.doc_no || 'Quote only'}</span>
                    </td>
                    <td className="nowrap muted c-date">{day(o.quote_date)}</td>
                    <td className="c-sp">{o.salesperson_name}</td>
                    <td className="nowrap c-act"><div className="row-acts"><OrderActions o={d} me={{ role: me.role }} back={listHref} sm onAction={handleAction} /></div></td>
                  </tr>

                  {/* ── Collapsible Items Table ── */}
                  {isOpen && (
                    <tr className="expanded-row-details">
                      <td colSpan={8} style={{ padding: '0 0 14px 0', background: 'var(--fill-2)', borderBottom: '1px solid var(--border)' }}>
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
                              <span className="fw6"><i className="ph ph-package mr-4" />{o.quote_no} Items</span>
                              <span className="muted">·</span>
                              <span className="muted">{plural((o.items || []).length, 'item')}</span>
                              <span className="muted">·</span>
                              <span className="fw6">Total: SAR {money(totals(o.items, o.transport, o.vat_rate).total)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openOrder(o)
                                }}
                                title="Open full order dialog"
                              >
                                <i className="ph ph-arrow-square-out" />Open dialog
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggle(o.id)
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
                                  <th>Product / Description</th>
                                  <th>Color</th>
                                  <th className="r">Ordered</th>
                                  <th className="r">Rate (SAR)</th>
                                  <th className="r">Total (SAR)</th>
                                  <th>Status</th>
                                  <th className="r">Dispatched</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items?.map((it, idx) => {
                                  const balance = it.qty - (it.dispatched_qty || 0)
                                  return (
                                    <tr key={it.id || idx}>
                                      <td className="muted text-xs">{it.item_no || idx + 1}</td>
                                      <td>
                                        <span className="mat-name">{describe(it) || it.description}</span>
                                        {Number(it.m2) > 0 && (
                                          <span className="mat-sub">
                                            {Number(it.qty) > 1 && (it.width && it.length ? (Number(it.width) * Number(it.length)) / 1e6 : it.m2 / it.qty)
                                              ? `${money(it.m2)} m² total · ${money(it.width && it.length ? (Number(it.width) * Number(it.length)) / 1e6 : it.m2 / it.qty)} m² / pc`
                                              : `${money(it.m2)} m²`}
                                          </span>
                                        )}
                                      </td>
                                      <td>{it.color_name || <span className="muted">—</span>}</td>
                                      <td className="num fw6">{int(it.qty)} PCS</td>
                                      <td className="num">{money(it.price)}</td>
                                      <td className="num fw6">{money(it.total)}</td>
                                      <td>
                                        {it.production_status ? (
                                          <span className="badge b-info text-xs">{it.production_status}</span>
                                        ) : balance <= 0 ? (
                                          <span className="badge b-ok text-xs">Complete</span>
                                        ) : (
                                          <span className="badge b-warn text-xs">In Progress</span>
                                        )}
                                      </td>
                                      <td className="num">
                                        {int(it.dispatched_qty || 0)} / {int(it.qty)}
                                      </td>
                                    </tr>
                                  )
                                })}
                                {(!o.items || o.items.length === 0) && (
                                  <tr>
                                    <td colSpan={8} className="muted text-center" style={{ padding: '16px' }}>
                                      No items in this order
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
          {!optimisticRows?.length && (
          <div className="empty">
            <i className="ph ph-clipboard-text" />
            <h3>No orders found</h3>
            <p>{term ? `Nothing matches “${term}”.` : 'Nothing in this list yet.'}</p>
          </div>
        )}
      </div>

      {activeOrder && (
        <OrderDialog
          o={activeOrder}
          history={history}
          me={me}
          back={viewHref(activeOrder.id)}
          closeHref={listHref}
          openBatchPi={openBatchPi}
          onClose={closeOrder}
          historyLoading={historyLoading}
        />
      )}
    </>
  )
}
