// Vercel Edge Function — proxy para /api/monitor do Finance App
// GET  /api/access?type=login-stats  → auditoria de logins (24h)
// GET  /api/access?type=user-stats   → métricas de utilizadores

export const config = { runtime: 'edge' }

const TARGET = process.env.TARGET_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
const SECRET = process.env.MONITOR_SECRET || ''

export default async function handler(req) {
  const type = new URL(req.url).searchParams.get('type') || 'login-stats'

  if (!['login-stats', 'user-stats'].includes(type)) {
    return new Response(JSON.stringify({ error: 'type inválido' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const r = await fetch(`${TARGET}/api/monitor/${type}`, {
      headers: { 'x-monitor-secret': SECRET },
      signal:  AbortSignal.timeout(10000),
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
