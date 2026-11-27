import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { invMasters } from '@/lib/inventory'
import { getSettings } from '@/lib/settings'
import { PO_STATUS, day, money, qty } from '@/lib/tas'
import { ClickRow, LinkBusy } from '../../ui'
import InvTabs from '../InvTabs'
import PODialog from './PODialog'
import POTable from './POTable'
import NewPODialog from './NewPODialog'
import POActions from './POActions'
import GRNDialog from '../grn/GRNDialog'
import GRNTable from '../grn/GRNTable'
import NewGRNDialog from '../grn/NewGRNDialog'

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams
  if (sp.new) return { title: 'New Purchase Order' }
  if (sp.receive) return { title: 'Receive Goods' }
  if (/^\d+$/.test(sp.view_grn || '')) {
    const { data } = await db().from('grns').select('grn_no').eq('id', sp.view_grn).maybeSingle()
    if (data?.grn_no) return { title: { absolute: data.grn_no } }
  }
  if (/^\d+$/.test(sp.view || '')) {
    const { data } = await db().from('purchase_orders').select('po_no').eq('id', sp.view).maybeSingle()
    if (data?.po_no) return { title: { absolute: data.po_no } }
  }
  return { title: sp.tab === 'grn' ? 'Goods Received (GRN)' : 'RM Purchase' }
}

const LIMIT = 200
const SHOWS = {
  open: ['PENDING', 'APPROVED'],
  PENDING: ['PENDING'],
  to_receive: ['APPROVED'],
  APPROVED: ['APPROVED'],
  CLOSED: ['CLOSED'],
  REJECTED: ['REJECTED'],
}

const PO_TABS = [
  ['open', 'Open'],
  ['PENDING', 'Pending approval'],
  ['to_receive', 'To Receive'],
  ['APPROVED', 'Approved'],
  ['CLOSED', 'Closed'],
  ['REJECTED', 'Rejected'],
]

export default async function POList({ searchParams }) {
  const sp = await searchParams
  const isGrn = sp.tab === 'grn'
  const show = SHOWS[sp.show] ? sp.show : (isGrn ? (sp.show === 'all' ? 'all' : 'pending') : 'open')
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()

  const viewId = /^\d+$/.test(sp.view || '') ? sp.view : null
  const viewGrnId = /^\d+$/.test(sp.view_grn || '') ? sp.view_grn : null
  const isNew = Boolean(sp.new)
  const receiveParam = sp.receive
  const isReceiving = Boolean(receiveParam)
  const receivePoId = /^\d+$/.test(receiveParam || '') ? receiveParam : null

  // 1. PO Query
  let poQ = db().from('purchase_orders')
    .select('*, items:po_items(*, m:materials(code, name, uom)), grns(id, grn_no, status, grn_date)')
    .order('id', { ascending: false })
    .limit(LIMIT)

  if (show === 'to_receive') {
    poQ = poQ.eq('status', 'APPROVED')
  } else if (!isGrn && SHOWS[show]) {
    poQ = poQ.in('status', SHOWS[show])
  }
  if (!isGrn && term) {
    poQ = poQ.or(`po_no.ilike.%${term}%,vendor_name.ilike.%${term}%`)
  }

  // 2. GRN Query (when on grn tab)
  let grnQ = db().from('grns')
    .select(isGrn
      ? '*, po:purchase_orders!inner(id, po_no, vendor_name), store:stores(name, plant_code), items:grn_items(*, m:materials(code, name, uom))'
      : 'id, status'
    )
    .order('id', { ascending: false })
    .limit(LIMIT)

  if (isGrn && show !== 'all') {
    grnQ = grnQ.eq('status', 'QC_PENDING')
  }
  if (isGrn && term) {
    grnQ = grnQ.or(`grn_no.ilike.%${term}%,invoice_no.ilike.%${term}%`)
  }

  // 3. Detail queries for open dialogs
  const poQuery = viewId
    ? db().from('purchase_orders')
        .select('*, plant:plants(name, address), vendor:vendors(*), items:po_items(*, m:materials(code, name, uom)), grns(id, grn_no, grn_date, status, invoice_no)')
        .eq('id', viewId).maybeSingle()
    : Promise.resolve({ data: null })

  const grnQuery = viewGrnId
    ? db().from('grns')
        .select('*, po:purchase_orders(id, po_no, vendor_name, vendor:vendors(address, vat_no, mobile)), store:stores(name, plant_code), items:grn_items(*, m:materials(code, name, uom))')
        .eq('id', viewGrnId).maybeSingle()
    : Promise.resolve({ data: null })

  const posForGrnQuery = isReceiving
    ? db().from('purchase_orders')
        .select('id, po_no, po_date, plant_code, vendor_name, items:po_items(*, m:materials(code, name, uom))')
        .eq('status', 'APPROVED')
        .order('id', { ascending: false })
        .limit(200)
    : Promise.resolve({ data: [] })

  const settingsQuery = (viewId || viewGrnId) ? getSettings() : Promise.resolve(null)

  const [
    me,
    { missing, plants, vendors, materials, stores },
    { data: poDataRows },
    { data: grnDataRows },
    { data: viewPO },
    { data: viewGRN },
    { data: approvedPos },
    s,
  ] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    poQ,
    grnQ,
    poQuery,
    grnQuery,
    posForGrnQuery,
    settingsQuery,
  ])

  // Filter for to_receive tab
  let poRows = poDataRows || []
  if (show === 'to_receive') {
    poRows = poRows.filter((p) => (p.items || []).some((i) => Number(i.pending_qty) > 0))
  }

  const grnRows = grnDataRows || []

  // Count metrics for tabs
  const poActiveCount = (poDataRows || []).filter((p) => ['PENDING', 'APPROVED'].includes(p.status)).length
  const grnPendingCount = (grnDataRows || []).filter((g) => g.status === 'QC_PENDING').length

  // URL Helpers
  const baseParams = { ...(term && { q: term }) }
  const poHref = (st) => `/inventory/po?${new URLSearchParams({ ...(st !== 'open' && { show: st }), ...baseParams })}`
  const grnHref = (pendingOnly) => `/inventory/po?${new URLSearchParams({ tab: 'grn', ...(pendingOnly ? {} : { show: 'all' }), ...baseParams })}`

  const listParams = {
    ...(isGrn && { tab: 'grn' }),
    ...(isGrn ? (show === 'all' && { show: 'all' }) : (show !== 'open' && { show })),
    ...(term && { q: term }),
  }
  const listHref = `/inventory/po${Object.keys(listParams).length ? `?${new URLSearchParams(listParams)}` : ''}`

  const viewHref = (id) => `/inventory/po?${new URLSearchParams({ ...listParams, view: id })}`
  const viewGrnHref = (id) => `/inventory/po?${new URLSearchParams({ ...listParams, view_grn: id })}`
  const receiveHref = (id) => `/inventory/po?${new URLSearchParams({ ...listParams, receive: String(id) })}`
  const qcHref = (grnId) => `/inventory/po?${new URLSearchParams({ ...listParams, view_grn: grnId })}`

  const newHref = `/inventory/po?${new URLSearchParams({ ...listParams, new: '1' })}`
  const receiveNewHref = `/inventory/po?${new URLSearchParams({ ...listParams, receive: '1' })}`

  return (
    <>
      <InvTabs tab={isGrn ? 'grn' : 'po'} missing={missing} />

      <div className="card">
        {/* ── Table Top Bar with Tabs and Filters ── */}
        <div className="tbl-top">
          <div className="d-flex ai-c gap-12 f-wrap">
            <nav className="tabs mb-0" aria-label="Buying sections">
              <Link
                prefetch={false}
                href="/inventory/po"
                className={`tab${!isGrn ? ' on' : ''}`}
              >
                <LinkBusy />
                <i className="ph ph-shopping-cart" />
                Purchase orders
                <span className="badge b-none">{poActiveCount}</span>
              </Link>
              <Link
                prefetch={false}
                href="/inventory/po?tab=grn"
                className={`tab${isGrn ? ' on' : ''}`}
              >
                <LinkBusy />
                <i className="ph ph-truck" />
                Goods received
                {grnPendingCount > 0 && <span className="badge b-warn">{grnPendingCount}</span>}
              </Link>
            </nav>
          </div>

          <div className="tbl-filters">
            {/* Sub-status tabs */}
            {!isGrn ? (
              <nav className="tabs mb-0" aria-label="PO status">
                {PO_TABS.map(([k, l]) => (
                  <Link prefetch={false} key={k} href={poHref(k)} className={`tab${k === show ? ' on' : ''}`}>
                    <LinkBusy />{l}
                  </Link>
                ))}
              </nav>
            ) : (
              <nav className="tabs mb-0" aria-label="GRN status">
                <Link prefetch={false} href={grnHref(true)} className={`tab${show !== 'all' ? ' on' : ''}`}>
                  <LinkBusy />Waiting to be checked
                </Link>
                <Link prefetch={false} href={grnHref(false)} className={`tab${show === 'all' ? ' on' : ''}`}>
                  <LinkBusy />All
                </Link>
              </nav>
            )}

            {/* Search form */}
            <form className="sw">
              {isGrn && <input type="hidden" name="tab" value="grn" />}
              {isGrn && show === 'all' && <input type="hidden" name="show" value="all" />}
              {!isGrn && show !== 'open' && <input type="hidden" name="show" value={show} />}
              <i className="ph ph-magnifying-glass" />
              <input
                className="tsearch"
                name="q"
                defaultValue={term}
                placeholder={isGrn ? 'GRN or invoice no…' : 'PO no or vendor…'}
                aria-label={isGrn ? 'Search GRNs' : 'Search purchase orders'}
              />
            </form>

            {/* Quick action buttons */}
            {/* Each tab's own main action: New PO on Purchase orders, Receive goods on Goods received */}
            {!isGrn ? (
              <Link prefetch={false} href={newHref} scroll={false} className="btn btn-primary btn-sm">
                <LinkBusy /><i className="ph ph-plus" />New PO
              </Link>
            ) : (
              <Link prefetch={false} href={receiveNewHref} scroll={false} className="btn btn-primary btn-sm">
                <LinkBusy /><i className="ph ph-truck" />Receive goods
              </Link>
            )}
          </div>
        </div>

        {/* ── Table Wrap ── */}
        <div className="tbl-wrap">
          {!isGrn ? (
            <POTable
              rows={poRows}
              listParams={listParams}
              listHref={listHref}
              me={{ role: me.role }}
              term={term}
              show={show}
            />
          ) : (
            <GRNTable
              rows={grnRows}
              listParams={listParams}
              term={term}
              show={show}
            />
          )}

        </div>

        {((!isGrn && poRows.length === LIMIT) || (isGrn && grnRows.length === LIMIT)) && (
          <div className="tbl-foot center">
            <span className="muted text-sm">Showing the latest {LIMIT} — search to narrow it down.</span>
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      {viewPO && <PODialog po={viewPO} s={s} me={me} back={viewHref(viewPO.id)} closeHref={listHref} />}

      {isNew && !viewPO && !viewGRN && (
        <NewPODialog
          plants={plants}
          vendors={vendors}
          materials={materials}
          closeHref={listHref}
        />
      )}

      {isReceiving && !viewPO && !viewGRN && (
        <NewGRNDialog
          pos={approvedPos || []}
          selectedPoId={receivePoId}
          stores={stores || []}
          closeHref={listHref}
        />
      )}

      {viewGRN && <GRNDialog grn={viewGRN} s={s} me={me} closeHref={listHref} />}
    </>
  )
}
