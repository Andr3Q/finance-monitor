// Vercel Cron Job — roda a cada minuto
// Checa todos os serviços e dispara push notification no celular se algo cair.
// Variáveis de ambiente necessárias:
//   TARGET_URL      — URL base do Finance App (opcional, tem padrão)
//   MONITOR_SECRET  — segredo compartilhado com o finance-app para autorizar o alerta
//   CRON_SECRET     — segredo para validar que a chamada vem do Vercel (opcional mas recomendado)

const TARGET = process.env.TARGET_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const checks = await Promise.all([
    ping(`${TARGET}/ping`,   'Servidor'),
    ping(`${TARGET}/health`, 'API + DB'),
    ping(`${TARGET}/`,       'Frontend'),
  ])

  const allOk  = checks.every(c => c.ok)
  const failed = checks.filter(c => !c.ok)
  const ts     = new Date().toISOString()

  if (!allOk && process.env.MONITOR_SECRET) {
    await fetch(`${TARGET}/api/monitor-alert`, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'x-monitor-secret': process.env.MONITOR_SECRET,
      },
      body: JSON.stringify({ failed, ts }),
    }).catch(err => console.error('[cron] Falha ao enviar alerta push:', err.message))
  }

  console.log(`[cron] ${ts} | ok=${allOk} | ${checks.map(c => `${c.name}:${c.ok ? 'ok' : 'FALHOU'}(${c.ms}ms)`).join(' ')}`)
  res.status(200).json({ ok: allOk, ts, checks })
}

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
