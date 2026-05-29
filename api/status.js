// Vercel Edge Function — checa o Finance app do lado do servidor
// Edge Runtime: zero cold start, overhead < 1ms
// Evita CORS e esconde a URL interna do cliente

export const config = { runtime: 'edge' }

const TARGET = process.env.TARGET_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'

export default async function handler(req) {
  const [checks, routes] = await Promise.all([
    Promise.all([
      ping(`${TARGET}/ping`,   'Servidor'),
      ping(`${TARGET}/health`, 'API + DB'),
      ping(`${TARGET}/`,       'Frontend'),
    ]),
    Promise.all([
      pingRoute(`${TARGET}/api/goals`,             'Metas'),
      pingRoute(`${TARGET}/api/installments`,       'Parcelas'),
      pingRoute(`${TARGET}/api/notifications`,      'Notificações'),
      pingRoute(`${TARGET}/api/agent`,              'IA Agent'),
      pingRoute(`${TARGET}/api/payments/history`,   'Pagamentos'),
      pingRoute(`${TARGET}/api/reports`,            'Relatórios'),
    ]),
  ])

  const allOk = checks.every(c => c.ok)

  return new Response(JSON.stringify({
    ok:     allOk,
    ts:     new Date().toISOString(),
    checks,
    routes,
  }), {
    status: 200,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control':               'no-store',
    },
  })
}

// Checa endpoints públicos (espera 2xx)
async function ping(url, name) {
  const t0 = Date.now()
  try {
    const r    = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ms   = Date.now() - t0
    const body = r.headers.get('content-type')?.includes('json') ? await r.json() : null
    return {
      name,
      ok:       r.ok,
      status:   r.status,
      ms,
      detail:   body?.status ?? (r.ok ? 'ok' : 'error'),
      dbStatus: body?.status === 'degraded' ? 'degraded' : (body?.status === 'ok' ? 'ok' : null),
    }
  } catch (err) {
    return { name, ok: false, status: 0, ms: Date.now() - t0, detail: err.message }
  }
}

// Checa rotas protegidas — 401 = rota existe e auth funciona (esperado)
async function pingRoute(url, name) {
  const t0 = Date.now()
  try {
    const r  = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ms = Date.now() - t0
    const ok = r.status === 401 || r.status === 403 || r.status === 429 || r.ok
    return { name, ok, status: r.status, ms }
  } catch (err) {
    return { name, ok: false, status: 0, ms: Date.now() - t0, detail: err.message }
  }
}
