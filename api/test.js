// Vercel Edge Function — testes on-demand por componente
// GET /api/test?service=servidor   → testa só o servidor
// GET /api/test?service=db         → testa só o banco
// GET /api/test                    → testa todos os 13 componentes

export const config = { runtime: 'edge' }

const TARGET = process.env.TARGET_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
const SECRET = process.env.MONITOR_SECRET || ''
let MONITOR_BASE = ''

const SERVICES = {
  servidor:      () => ping(`${TARGET}/ping`,                  'Servidor',     'GET /ping'),
  db:            () => pingHealth(`${TARGET}/health`,          'Banco de Dados','GET /health'),
  frontend:      () => ping(`${TARGET}/`,                      'Frontend',     'GET /'),
  auth:          () => pingRoute(`${TARGET}/api/auth/me`,      'Auth API',     'GET /api/auth/me'),
  goals:         () => pingRoute(`${TARGET}/api/goals`,        'Metas',        'GET /api/goals'),
  installments:  () => pingRoute(`${TARGET}/api/installments`, 'Parcelas',     'GET /api/installments'),
  notifications: () => pingRoute(`${TARGET}/api/notifications`,'Notificações', 'GET /api/notifications'),
  agent:         () => pingRoute(`${TARGET}/api/agent`,        'IA Agent',     'GET /api/agent'),
  payments:      () => pingRoute(`${TARGET}/api/payments/history`, 'Pagamentos', 'GET /api/payments/history'),
  reports:       () => pingRoute(`${TARGET}/api/reports`,      'Relatórios',   'GET /api/reports'),
  '2fa':         () => pingRoute2FA(`${TARGET}/api/auth/2fa`, '2FA',          'GET /api/auth/2fa'),
  npm:           () => pingSecurity('npm', 'npm audit'),
  trivy:         () => pingSecurity('trivy', 'Trivy'),
}

export default async function handler(req) {
  MONITOR_BASE = new URL(req.url).origin
  const url     = new URL(req.url)
  const service = url.searchParams.get('service')

  let results

  if (service && SERVICES[service]) {
    results = [await SERVICES[service]()]
  } else {
    results = await Promise.all(Object.values(SERVICES).map(fn => fn()))
  }

  return new Response(JSON.stringify({
    ts:      new Date().toISOString(),
    results,
  }), {
    status: 200,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control':               'no-store',
    },
  })
}

// Endpoint público — espera 2xx
async function ping(url, name, endpoint) {
  const t0 = Date.now()
  try {
    const r   = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ms  = Date.now() - t0
    return { name, endpoint, ok: r.ok, status: r.status, ms, detail: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status} — falhou` }
  } catch (err) {
    return { name, endpoint, ok: false, status: 0, ms: Date.now() - t0, detail: err.message }
  }
}

// /health — lê JSON para db_ms
async function pingHealth(url, name, endpoint) {
  const t0 = Date.now()
  try {
    const r    = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ms   = Date.now() - t0
    const body = await r.json().catch(() => ({}))
    const ok   = r.ok && body.status !== 'degraded'
    const detail = ok
      ? `DB online — ${body.db_ms ?? ms}ms`
      : body.status === 'degraded' ? 'DB degradado' : `HTTP ${r.status}`
    return { name, endpoint, ok, status: r.status, ms, detail, dbMs: body.db_ms ?? null }
  } catch (err) {
    return { name, endpoint, ok: false, status: 0, ms: Date.now() - t0, detail: err.message }
  }
}

// Rota protegida — 401/403/429 = rota viva e auth activo
async function pingRoute(url, name, endpoint) {
  const t0 = Date.now()
  try {
    const r  = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ms = Date.now() - t0
    const ok = r.status === 401 || r.status === 403 || r.status === 429 || r.ok
    const detail = ok
      ? r.status === 401 ? 'Auth activo (401)' : r.status === 429 ? 'Rate limit activo (429)' : `HTTP ${r.status}`
      : `HTTP ${r.status} — inesperado`
    return { name, endpoint, ok, status: r.status, ms, detail }
  } catch (err) {
    return { name, endpoint, ok: false, status: 0, ms: Date.now() - t0, detail: err.message }
  }
}

// 2FA — aceita 401 ou 404 (sem rota GET raiz — serviço vivo)
async function pingRoute2FA(url, name, endpoint) {
  const t0 = Date.now()
  try {
    const r  = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ms = Date.now() - t0
    const ok = r.status === 401 || r.status === 403 || r.status === 404 || r.status === 429 || r.ok
    const detail = r.status === 404
      ? 'Serviço activo (sem rota GET raiz)'
      : r.status === 401 ? 'Auth activo (401)' : `HTTP ${r.status}`
    return { name, endpoint, ok, status: r.status, ms, detail }
  } catch (err) {
    return { name, endpoint, ok: false, status: 0, ms: Date.now() - t0, detail: err.message }
  }
}

// Security — chama /api/security do monitor (proxy) e verifica campo específico
async function pingSecurity(field, name) {
  const t0 = Date.now()
  try {
    const base = MONITOR_BASE || TARGET
    const r    = await fetch(`${base}/api/security`, {
      headers: { 'x-monitor-secret': SECRET },
      signal:  AbortSignal.timeout(15000),
    })
    const ms   = Date.now() - t0
    const body = await r.json().catch(() => ({}))
    const scan = body[field === 'npm' ? 'npm_audit' : 'trivy']
    if (!scan) return { name, endpoint: `GET /api/security → campo ${field}`, ok: true, status: r.status, ms, detail: 'Endpoint activo — scan ainda não executado' }
    const ok = scan.status !== 'error'
    const detail = scan.status === 'clean'
      ? 'Limpo — sem vulnerabilidades'
      : scan.status === 'unavailable' ? 'Indisponível temporariamente'
      : scan.vulnCount ? `${scan.vulnCount} vulnerabilidade(s)` : (scan.status || 'ok')
    return { name, endpoint: `GET /api/security → ${field}`, ok, status: 200, ms, detail, lastRun: scan.runAt }
  } catch (err) {
    return { name, endpoint: `GET /api/security → ${field}`, ok: false, status: 0, ms: Date.now() - t0, detail: err.message }
  }
}
