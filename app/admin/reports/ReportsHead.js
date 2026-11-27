import Link from 'next/link'
import { DateRange, LinkBusy } from '../../ui'
import PageTabs from '../../PageTabs'
import DriveSyncButton from '../../DriveSyncButton'

export const REPORTS = [
  { key: '', label: 'Overview', icon: 'ph-squares-four' },
  { key: 'salespeople', label: 'Salespeople', icon: 'ph-user' },
  { key: 'customers', label: 'Customers', icon: 'ph-storefront' },
  { key: 'waiting', label: 'Waiting', icon: 'ph-clock' },
  { key: 'dispatch', label: 'Dispatch', icon: 'ph-truck' },
]

// Tabs, the period every report shares, and this report's downloads. periodless: the report ignores dates.
export default function ReportsHead({ tab, p, exports = [], periodless }) {
  const base = `/admin/reports${tab ? `/${tab}` : ''}`
  return (
    <>
      <PageTabs group="reports" on="/admin/reports" label="Reports" />
      <div className="reports-bar">
        <nav className="tabs reports-subnav" aria-label="Sales reports">
          {REPORTS.map((r) => (
            <Link
              prefetch={false}
              key={r.key}
              href={`/admin/reports${r.key ? `/${r.key}` : ''}?${p.qs}`}
              className={`tab${r.key === tab ? ' on' : ''}`}
              aria-current={r.key === tab ? 'page' : undefined}
            >
              <LinkBusy />
              <i className={`ph ${r.icon}`} />{r.label}
            </Link>
          ))}
        </nav>

        <div className="reports-bar-acts">
          {periodless ? (
            <span className="sub text-sm">Live: what is waiting right now, whatever the period.</span>
          ) : (
            <form action={base} className="reports-dr-form">
              <DateRange from={p.from} to={p.to} />
            </form>
          )}
          {exports.length > 0 && (
            <details className="dl-menu q-menu">
              <summary className="btn btn-ghost btn-sm">
                <i className="ph ph-download-simple" />
                <span className="q-label">Export</span>
                <i className="ph ph-caret-down q-caret" />
              </summary>
              <div className="dl-list">
                {exports.map(([k, l]) => (
                  <a key={k} className="dl-item" href={`/admin/export/${k}?${p.qs}`}><i className="ph ph-file-csv" />{l}</a>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <div style={{ padding: '4px 6px' }}>
                  <DriveSyncButton label="Sync Month CSV to Drive" />
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </>
  )
}

// Horizontal bar for a value against the largest in the table.
export const Bar = ({ v, max }) => (
  <div className="bar" style={{ width: `${Math.max(2, (v / Math.max(1, max)) * 100)}%` }} />
)
