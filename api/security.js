// Vercel Edge Function — proxy para /api/security do Finance App
// GET  → retorna últimos resultados de npm audit + trivy
// POST → dispara scan manual

export const config = { runtime: 'edge' }

const TARGET = process.env.TARGET_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
const SECRET = process.env.MONITOR_SECRET || ''

export default async function handler(req) {
  try {
    const isPost = req.method === 'POST'
    const url    = isPost ? `${TARGET}/api/security/run` : `${TARGET}/api/security/latest`

    const r = await fetch(url, {
      method:  isPost ? 'POST' : 'GET',
      headers: { 'x-monitor-secret': SECRET, 'Content-Type': 'application/json' },
      signal:  AbortSignal.timeout(15000),
    })

    const data = await r.json()
    return new Response(JSON.stringify(data), {
      status: r.ok ? 200 : r.status,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control':               'no-store',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
