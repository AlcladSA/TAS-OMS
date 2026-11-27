import { day, dmy, qty, storeLabel } from '@/lib/tas'
import { PrintButton, RouteDialog } from '../../ui'
import Slip from '../Slip'

export default function IssueDialog({ issue, s, closeHref }) {
  if (!issue) return null
  issue.items?.sort((a, b) => a.id - b.id)

  const footer = null

  const slip = (
    <Slip
      s={s}
      fno="F.NO:-TAS/STR/02"
      title="MATERIAL ISSUE SLIP"
      meta={[
        ['DATE', dmy(issue.doc_date)],
        ['ISSUE NO.', issue.doc_no],
        ['REQUESTED BY', issue.requested_by],
        ['ISSUED BY', issue.by_name],
      ]}
      party={[
        ['FROM', [storeLabel(issue.from)]],
        ['TO', [storeLabel(issue.to)]],
      ]}
      heads={['MATERIAL', 'CODE', 'UOM', 'QTY']}
      rows={issue.items?.map((i) => [i.m?.name, i.m?.code, i.m?.uom, qty(i.qty)]) || []}
      notes={issue.notes}
      signs={['Issued By', 'Received By']}
    />
  )

  return (
    <RouteDialog
      print={issue.doc_no}
      key={issue.id}
      icon="ph-arrows-left-right"
      title={<>Issue {issue.doc_no}</>}
      footer={footer}
      closeHref={closeHref}
    >
      <div className="no-print">
        {/* ── Issue Details Summary ── */}
        <div className="card mb-16">
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className="ph ph-info" />Issue Details</h2>
          </div>
          <div className="fgrid-4" style={{ padding: '0 16px 16px' }}>
            <div>
              <span className="muted text-xs">Issue Date</span>
              <div className="fw6">{day(issue.doc_date)}</div>
            </div>
            <div>
              <span className="muted text-xs">From Store</span>
              <div className="fw6">{storeLabel(issue.from)}</div>
            </div>
            <div>
              <span className="muted text-xs">To (Line / Store)</span>
              <div className="fw6">{storeLabel(issue.to)}</div>
            </div>
            <div>
              <span className="muted text-xs">Requested By</span>
              <div className="fw6">{issue.requested_by || '—'}</div>
            </div>
            <div>
              <span className="muted text-xs">Issued By</span>
              <div className="fw6">{issue.by_name || '—'}</div>
            </div>
            <div>
              <span className="muted text-xs">Total Lines</span>
              <div className="fw6">{issue.items?.length ?? 0}</div>
            </div>
          </div>
          {issue.notes && (
            <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
              <span className="muted text-xs d-block mt-10">Notes</span>
              <span className="text-sm">{issue.notes}</span>
            </div>
          )}
        </div>

        {/* ── Issued Items Simple Table ── */}
        <div className="card">
          <div className="tbl-top">
            <h2 className="tbl-ttl">
              <i className="ph ph-package" />Issued Items <span className="badge b-none">{issue.items?.length ?? 0}</span>
            </h2>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Code</th>
                  <th>UoM</th>
                  <th className="r">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {issue.items?.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Material"><span className="mat-name">{i.m?.name}</span></td>
                    <td data-label="Code">{i.m?.code}</td>
                    <td data-label="UoM">{i.m?.uom}</td>
                    <td className="num fw6" data-label="Quantity">{qty(i.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Document Preview (folded disclosure) ── */}
        <details className="disclosure mt-16">
          <summary className="btn btn-ghost btn-sm d-iflex ai-c gap-8">
            <i className="ph ph-file-text" />Preview Material Issue Slip (Print Document)
            <i className="ph ph-caret-down disc-caret" />
          </summary>
          <div className="mt-14">
            {slip}
          </div>
        </details>
      </div>

      {/* ── Printable Slip: visible only when printed ── */}
      <div className="print-only">
        {slip}
      </div>
    </RouteDialog>
  )
}
