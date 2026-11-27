import { currentUser } from '@/lib/server'
import { syncMonthlyOrdersCsvToDrive } from '@/lib/drive'

export async function POST(req) {
  return handleSync(req)
}

export async function GET(req) {
  return handleSync(req)
}

async function handleSync(req) {
  try {
    const me = await currentUser()
    if (!me) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
    }

    const url = new URL(req.url)
    const month = url.searchParams.get('month') || undefined

    const res = await syncMonthlyOrdersCsvToDrive(month)
    return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error('API /api/drive/sync-orders error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Drive sync failed' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}
