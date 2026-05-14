// Vercel serverless function — checa o Finance app do lado do servidor
// Evita CORS e esconde a URL interna do cliente

const TARGET = 'https://finance-app-1042158013294.southamerica-east1.run.app'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const checks = await Promise.all([
    ping(`${TARGET}/health`,  'API + DB'),
    ping(`${TARGET}/`,        'Frontend'),
  ])

  const allOk = checks.every(c => c.ok)

  res.status(200).json({
    ok:        allOk,
    ts:        new Date().toISOString(),
    checks,
  })
}

async function ping(url, name) {
  const t0 = Date.now()
  try {
    const r   = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ms  = Date.now() - t0
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
