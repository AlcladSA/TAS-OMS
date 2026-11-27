'use client'

import { Fragment, useState, useMemo } from 'react'
import Link from 'next/link'
import { day, money, qty } from '@/lib/tas'

const LAYER_LABELS = {
  TOP_COIL: 'Top Coil',
  BOTTOM_COIL: 'Bottom Coil',
  CORE: 'Core / Resin',
  ADHESIVE_FILM: 'Adhesive Film',
  MASKING_FILM: 'Masking Film',
  CONSUMABLE: 'Consumable',
  OTHER: 'Other',
}

export default function DailyConsumptionTable({ days = [], totals = {}, from, to }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const [viewMode, setViewMode] = useState('summary') // 'summary' or 'detailed'
  const [selectedLayer, setSelectedLayer] = useState('ALL')
  const [selectedLine, setSelectedLine] = useState('ALL')

  // Collect all unique lines across days for the filter dropdown
  const allLines = useMemo(() => {
    const set = new Set()
    for (const d of days) {
      for (const l of d.lines || []) {
        if (l) set.add(l)
      }
    }
    return Array.from(set).sort()
  }, [days])

  // Toggle single day expansion
  const toggle = (date) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // Toggle all days expansion
  const toggleAll = () => {
    if (expanded.size === filteredDays.length) {
      setExpanded(new Set())
    } else {
      setExpanded(new Set(filteredDays.map((d) => d.date)))
    }
  }

  // Filtered days based on line & layer selections
  const filteredDays = useMemo(() => {
    return days
      .map((d) => {
        // Line filter check
        if (selectedLine !== 'ALL' && !d.lines?.includes(selectedLine)) {
          return null
        }

        // Layer filter on materials
        const filteredMaterials = (d.materials || []).filter((m) => {
          if (selectedLayer === 'ALL') return true
          if (selectedLayer === 'COILS') return m.layer_type === 'TOP_COIL' || m.layer_type === 'BOTTOM_COIL'
          return m.layer_type === selectedLayer
        })

        if (selectedLayer !== 'ALL' && filteredMaterials.length === 0) {
          return null
        }

        return {
          ...d,
          materials: filteredMaterials,
        }
      })
      .filter(Boolean)
  }, [days, selectedLine, selectedLayer])

  // Re-calculate totals based on filtered view
  const currentTotals = useMemo(() => {
    const totalKg = filteredDays.reduce((s, d) => s + (d.totalKg || 0), 0)
    const goodM2 = filteredDays.reduce((s, d) => s + (d.goodM2 || 0), 0)
    const goodPcs = filteredDays.reduce((s, d) => s + (d.goodPcs || 0), 0)
    const topCoilKg = filteredDays.reduce((s, d) => s + (d.topCoilKg || 0), 0)
    const bottomCoilKg = filteredDays.reduce((s, d) => s + (d.bottomCoilKg || 0), 0)
    const coreKg = filteredDays.reduce((s, d) => s + (d.coreKg || 0), 0)
    const adhesiveKg = filteredDays.reduce((s, d) => s + (d.adhesiveKg || 0), 0)
    const filmM2 = filteredDays.reduce((s, d) => s + (d.filmM2 || 0), 0)
    const totalSar = filteredDays.reduce((s, d) => s + (d.totalSar || 0), 0)
    const avgKgPerM2 = goodM2 > 0 && totalKg > 0 ? totalKg / goodM2 : 0

    return {
      totalKg,
      goodM2,
      goodPcs,
      topCoilKg,
      bottomCoilKg,
      coreKg,
      adhesiveKg,
      filmM2,
      totalSar,
      avgKgPerM2,
    }
  }, [filteredDays])

  return (
    <>
      {/* ── Summary KPI Cards ── */}
      <div className="stats">
        <div className="stat">
          <div className="stat-n">{qty(Math.round(currentTotals.totalKg))} <span className="text-sm fw4 muted">KG</span></div>
          <div className="stat-l">Total Raw Material Consumed</div>
          <div className="stat-sub">
            {qty(Math.round(currentTotals.topCoilKg + currentTotals.bottomCoilKg))} KG Coils · {qty(Math.round(currentTotals.coreKg))} KG Core
          </div>
        </div>

        <div className="stat">
          <div className="stat-n fw7">{money(currentTotals.goodM2)} <span className="text-sm fw4 muted">M²</span></div>
          <div className="stat-l">Panels Produced</div>
          <div className="stat-sub">{qty(currentTotals.goodPcs)} good pieces</div>
        </div>

        <div className="stat">
          <div className="stat-n" style={{ color: currentTotals.avgKgPerM2 > 0 ? 'var(--btn-ok)' : undefined }}>
            {currentTotals.avgKgPerM2 > 0 ? currentTotals.avgKgPerM2.toFixed(2) : '—'}{' '}
            <span className="text-sm fw4 muted">KG/M²</span>
          </div>
          <div className="stat-l">Specific Consumption Rate</div>
          <div className="stat-sub">Standard ACP density ~4.8 – 5.5</div>
        </div>

        <div className="stat">
          <div className="stat-n">{qty(Math.round(currentTotals.filmM2))} <span className="text-sm fw4 muted">M²</span></div>
          <div className="stat-l">Protective Film Consumed</div>
          <div className="stat-sub">{qty(Math.round(currentTotals.adhesiveKg))} KG Adhesive Film</div>
        </div>
      </div>

      {/* ── Main Day-wise Consumption Table Card ── */}
      <div className="card">
        <div className="tbl-top">
          <div className="d-flex ai-c gap-8 flex-wrap">
            <h2 className="tbl-ttl">
              <i className="ph ph-calendar" />Day-wise Raw Material Consumption
              <span className="badge b-none">{filteredDays.length} days</span>
            </h2>
          </div>

          <div className="tbl-filters">
            {/* View Mode Switcher */}
            <div className="tabs m-0" style={{ display: 'inline-flex' }}>
              <button
                type="button"
                className={`tab${viewMode === 'summary' ? ' on' : ''}`}
                onClick={() => setViewMode('summary')}
              >
                <i className="ph ph-table mr-4" />Daily Totals
              </button>
              <button
                type="button"
                className={`tab${viewMode === 'detailed' ? ' on' : ''}`}
                onClick={() => setViewMode('detailed')}
              >
                <i className="ph ph-list-dashes mr-4" />Itemized Details
              </button>
            </div>

            {/* Line Filter */}
            {allLines.length > 1 && (
              <select
                className="flt-sel"
                value={selectedLine}
                onChange={(e) => setSelectedLine(e.target.value)}
                aria-label="Filter by line"
              >
                <option value="ALL">All lines</option>
                {allLines.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}

            {/* Layer Filter */}
            <select
              className="flt-sel"
              value={selectedLayer}
              onChange={(e) => setSelectedLayer(e.target.value)}
              aria-label="Filter by layer"
            >
              <option value="ALL">All layers</option>
              <option value="COILS">Coils (Top &amp; Bottom)</option>
              <option value="CORE">Core / Resin (LDPE / CaCO3)</option>
              <option value="ADHESIVE_FILM">Adhesive Film</option>
              <option value="MASKING_FILM">Protective / Masking Film</option>
            </select>

            {/* CSV Export Button */}
            <a
              className="btn btn-ghost btn-sm"
              href={`/production/reports/export?from=${from}&to=${to}`}
              title="Download Day-wise Consumption CSV"
            >
              <i className="ph ph-download-simple" />Export CSV
            </a>
          </div>
        </div>

        {/* ── VIEW 1: Daily Summary with Expandable Items ── */}
        {viewMode === 'summary' && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 40, paddingRight: 0 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-icon"
                      title={expanded.size === filteredDays.length ? 'Collapse all' : 'Expand all'}
                      onClick={toggleAll}
                      aria-label="Toggle all rows"
                    >
                      <i className={`ph ${expanded.size === filteredDays.length && filteredDays.length > 0 ? 'ph-caret-down' : 'ph-caret-right'}`} />
                    </button>
                  </th>
                  <th>Date</th>
                  <th>Lines &amp; DPRs</th>
                  <th className="r">Good Output</th>
                  <th className="r">Top Coil (KG)</th>
                  <th className="r">Bottom Coil (KG)</th>
                  <th className="r">Core / Resin (KG)</th>
                  <th className="r">Adhesive (KG)</th>
                  <th className="r">Prot. Film (M²)</th>
                  <th className="r fw7" style={{ background: 'var(--fill-2)' }}>Total RM (KG)</th>
                  <th className="r">Rate (KG/M²)</th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '36px 16px' }} className="muted">
                      <i className="ph ph-calendar-x" style={{ fontSize: '1.75rem', display: 'block', marginBottom: 6 }} />
                      No material consumption records found in this date period.
                    </td>
                  </tr>
                ) : (
                  filteredDays.map((d) => {
                    const isOpen = expanded.has(d.date)
                    return (
                      <Fragment key={d.date}>
                        <tr
                          className={`clickable ${isOpen ? 'grp' : ''}`}
                          onClick={() => toggle(d.date)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ paddingRight: 0 }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs btn-icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggle(d.date)
                              }}
                              aria-expanded={isOpen}
                              aria-label={isOpen ? 'Collapse day details' : 'Expand day details'}
                            >
                              <i className={`ph ph-caret-${isOpen ? 'down' : 'right'} disc-caret`} />
                            </button>
                          </td>
                          <td className="nowrap fw6">{day(d.date)}</td>
                          <td data-label="Lines & DPRs">
                            <div className="d-flex ai-c gap-6 flex-wrap">
                              {d.dprs?.map((dpr) => (
                                <span key={dpr} className="badge b-none text-xs">{dpr}</span>
                              ))}
                              {d.lines?.map((line) => (
                                <span key={line} className="muted text-xs">· {line}</span>
                              ))}
                            </div>
                          </td>
                          <td className="num fw6" data-label="Good Output">
                            {money(d.goodM2)} <span className="muted text-xs">M²</span>
                            {d.goodPcs > 0 && <span className="muted text-xs d-block">({qty(d.goodPcs)} pcs)</span>}
                          </td>
                          <td className="num" data-label="Top Coil">{d.topCoilKg > 0 ? qty(Math.round(d.topCoilKg)) : <span className="muted">—</span>}</td>
                          <td className="num" data-label="Bottom Coil">{d.bottomCoilKg > 0 ? qty(Math.round(d.bottomCoilKg)) : <span className="muted">—</span>}</td>
                          <td className="num" data-label="Core / Resin">{d.coreKg > 0 ? qty(Math.round(d.coreKg)) : <span className="muted">—</span>}</td>
                          <td className="num" data-label="Adhesive">{d.adhesiveKg > 0 ? qty(Math.round(d.adhesiveKg)) : <span className="muted">—</span>}</td>
                          <td className="num" data-label="Prot. Film">{d.filmM2 > 0 ? qty(Math.round(d.filmM2)) : <span className="muted">—</span>}</td>
                          <td className="num fw7" style={{ background: 'var(--fill-2)' }} data-label="Total RM">
                            {qty(Math.round(d.totalKg))}
                          </td>
                          <td className="num" data-label="Rate (KG/M²)">
                            {d.kgPerM2 > 0 ? (
                              <span className="badge b-ok">{d.kgPerM2.toFixed(2)}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>

                        {/* ── Expanded Nested Item Breakdown for this Date ── */}
                        {isOpen && (
                          <tr className="expanded-row-details">
                            <td colSpan={11} style={{ padding: '0 0 16px 0', background: 'var(--fill-2)', borderBottom: '1px solid var(--border)' }}>
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
                                    <span className="fw6"><i className="ph ph-calendar mr-4" />{day(d.date)} Itemized Raw Material Breakdown</span>
                                    <span className="muted">·</span>
                                    <span className="muted">{d.materials?.length || 0} materials consumed</span>
                                    {d.goodM2 > 0 && (
                                      <>
                                        <span className="muted">·</span>
                                        <span className="badge b-info text-xs">{money(d.goodM2)} M² produced</span>
                                      </>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggle(d.date)
                                    }}
                                  >
                                    <i className="ph ph-caret-up" />Collapse
                                  </button>
                                </div>

                                <div className="tbl-wrap" style={{ borderTop: 'none', maxHeight: 'none' }}>
                                  <table className="tbl" style={{ width: '100%' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ width: 40 }}>#</th>
                                        <th>Layer Type</th>
                                        <th>Material</th>
                                        <th>Code</th>
                                        <th>DPR / Line</th>
                                        <th className="r">System (BOM)</th>
                                        <th className="r fw6">Actual Consumed</th>
                                        <th className="r">Variance</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {d.materials?.map((m, idx) => (
                                        <tr key={m.id || idx}>
                                          <td className="muted text-xs">{idx + 1}</td>
                                          <td>
                                            <span className="badge b-none text-xs">{LAYER_LABELS[m.layer_type] || m.layer_type}</span>
                                          </td>
                                          <td><span className="mat-name">{m.name}</span></td>
                                          <td><span className="mat-sub">{m.code}</span></td>
                                          <td className="text-xs">
                                            {m.dpr_no ? (
                                              <Link prefetch={false} href={`/production/dpr?view=${m.dpr_no}`} className="font-mono fw6">
                                                {m.dpr_no}
                                              </Link>
                                            ) : '—'}
                                            {m.line && <span className="muted d-block">{m.line}</span>}
                                          </td>
                                          <td className="num" data-label="System BOM">
                                            {qty(m.system_qty)} <span className="muted text-xs">{m.uom}</span>
                                          </td>
                                          <td className="num fw7" data-label="Actual Consumed">
                                            {qty(m.actual_qty)} <span className="muted text-xs">{m.uom}</span>
                                          </td>
                                          <td className="num" data-label="Variance">
                                            {m.diff_pct !== 0 ? (
                                              <span className={`badge ${Math.abs(m.diff_pct) > 5 ? 'b-danger' : 'b-warn'}`}>
                                                {m.diff_pct > 0 ? `+${m.diff_pct}%` : `${m.diff_pct}%`}
                                              </span>
                                            ) : (
                                              <span className="badge b-none">0%</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>

              {/* ── Table Footer Totals ── */}
              {filteredDays.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--fill-2)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td colSpan={3} style={{ paddingLeft: 20 }}>
                      TOTAL ({filteredDays.length} days)
                    </td>
                    <td className="num fw7">{money(currentTotals.goodM2)} M²</td>
                    <td className="num">{qty(Math.round(currentTotals.topCoilKg))}</td>
                    <td className="num">{qty(Math.round(currentTotals.bottomCoilKg))}</td>
                    <td className="num">{qty(Math.round(currentTotals.coreKg))}</td>
                    <td className="num">{qty(Math.round(currentTotals.adhesiveKg))}</td>
                    <td className="num">{qty(Math.round(currentTotals.filmM2))}</td>
                    <td className="num fw7" style={{ background: 'var(--fill)', fontSize: '0.9375rem' }}>
                      {qty(Math.round(currentTotals.totalKg))} KG
                    </td>
                    <td className="num">
                      <span className="badge b-ok">{currentTotals.avgKgPerM2.toFixed(2)}</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── VIEW 2: Itemized Detailed Table Grouped by Date ── */}
        {viewMode === 'detailed' && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>DPR / Line</th>
                  <th>Layer</th>
                  <th>Material</th>
                  <th>Code</th>
                  <th className="r">System (BOM)</th>
                  <th className="r fw7">Actual Consumed</th>
                  <th className="r">Variance</th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px 16px' }} className="muted">
                      No material records found in this period.
                    </td>
                  </tr>
                ) : (
                  filteredDays.map((d) => (
                    <Fragment key={d.date}>
                      <tr className="grp" style={{ background: 'var(--fill-2)' }}>
                        <td colSpan={8} style={{ padding: '8px 20px' }}>
                          <div className="d-flex jc-sb ai-c flex-wrap gap-8">
                            <div>
                              <span className="fw7">{day(d.date)}</span>
                              <span className="muted text-xs ml-8">
                                · Output: {money(d.goodM2)} M² ({qty(d.goodPcs)} pcs) · Total RM: {qty(Math.round(d.totalKg))} KG ({d.kgPerM2.toFixed(2)} KG/M²)
                              </span>
                            </div>
                            <div className="d-flex gap-4">
                              {d.dprs?.map((dpr) => (
                                <span key={dpr} className="badge b-none text-xs">{dpr}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {d.materials?.map((m) => (
                        <tr key={m.id}>
                          <td className="nowrap text-xs muted">{day(d.date)}</td>
                          <td className="text-xs">
                            <span className="font-mono fw6">{m.dpr_no}</span>
                            {m.line && <span className="muted d-block">{m.line}</span>}
                          </td>
                          <td>
                            <span className="badge b-none text-xs">{LAYER_LABELS[m.layer_type] || m.layer_type}</span>
                          </td>
                          <td><span className="mat-name">{m.name}</span></td>
                          <td><span className="mat-sub">{m.code}</span></td>
                          <td className="num" data-label="System BOM">
                            {qty(m.system_qty)} <span className="muted text-xs">{m.uom}</span>
                          </td>
                          <td className="num fw7" data-label="Actual Consumed">
                            {qty(m.actual_qty)} <span className="muted text-xs">{m.uom}</span>
                          </td>
                          <td className="num" data-label="Variance">
                            {m.diff_pct !== 0 ? (
                              <span className={`badge ${Math.abs(m.diff_pct) > 5 ? 'b-danger' : 'b-warn'}`}>
                                {m.diff_pct > 0 ? `+${m.diff_pct}%` : `${m.diff_pct}%`}
                              </span>
                            ) : (
                              <span className="badge b-none">0%</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
