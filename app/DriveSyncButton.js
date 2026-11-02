'use client'

import { useState } from 'react'

export default function DriveSyncButton({ month, label = 'Sync to Drive', cls = 'btn btn-ghost btn-sm' }) {
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)

  const handleSync = async () => {
    if (syncing) return
    setSyncing(true)
    setSynced(false)
    try {
      const url = month ? `/api/drive/sync-orders?month=${encodeURIComponent(month)}` : '/api/drive/sync-orders'
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to sync to Drive')
      }
      setSynced(true)
      setTimeout(() => setSynced(false), 4000)
    } catch (err) {
      console.error('Drive sync failed:', err)
      alert('Could not sync orders to Google Drive: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      type="button"
      className={cls}
      onClick={handleSync}
      disabled={syncing}
      title="Export and save monthly orders CSV to Google Drive"
      style={synced ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
    >
      {syncing ? (
        <>
          <span className="spin" />
          <span>Syncing...</span>
        </>
      ) : synced ? (
        <>
          <i className="ph ph-check" style={{ color: 'var(--green)' }} />
          <span>Saved to Drive!</span>
        </>
      ) : (
        <>
          <i className="ph ph-upload-simple" />
          <span>{label}</span>
        </>
      )}
    </button>
  )
}
