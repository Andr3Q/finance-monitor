// Vercel Cron Job — roda a cada minuto
// Checa todos os serviços e envia alerta por email se algum cair.
// Requer variáveis de ambiente:
//   TARGET_URL       — URL base do Finance App (opcional, tem padrão)
//   RESEND_API_KEY   — chave da API Resend para envio de email
//   ALERT_EMAIL      — endereço que receberá os alertas
//   CRON_SECRET      — segredo para validar que a chamada vem do Vercel (opcional mas recomendado)

const TARGET = process.env.TARGET_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'

// Cooldown em memória: evita spam quando o serverless instance é reutilizado.
// Em prod cada invocação pode ser uma instância nova — use RESEND_COOLDOWN_MINUTES
// junto com Vercel KV para cooldown real persistente.
let lastAlertTs = 0
const COOLDOWN_MS = (parseInt(process.env.RESEND_COOLDOWN_MINUTES) || 15) * 60 * 1000

export default async function handler(req, res) {
  // Valida segredo para que só o Vercel scheduler possa chamar este endpoint
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const checks = await Promise.all([
    ping(`${TARGET}/ping`,   'Servidor'),
    ping(`${TARGET}/health`, 'API + DB'),
    ping(`${TARGET}/`,       'Frontend'),
  ])

  const allOk    = checks.every(c => c.ok)
  const failed   = checks.filter(c => !c.ok)
  const now      = Date.now()
  const result   = { ok: allOk, ts: new Date().toISOString(), checks }

  if (!allOk && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
    if (now - lastAlertTs > COOLDOWN_MS) {
      lastAlertTs = now
      await sendAlert(failed, result.ts).catch(err =>
        console.error('[cron] Falha ao enviar alerta:', err.message)
      )
    } else {
      console.log(`[cron] Alerta suprimido (cooldown ativo, próximo em ${Math.ceil((COOLDOWN_MS - (now - lastAlertTs)) / 60000)}min)`)
    }
  }

  console.log(`[cron] ${result.ts} | ok=${allOk} | checks=${JSON.stringify(checks.map(c => ({ n: c.name, ok: c.ok, ms: c.ms })))}`)
  res.status(200).json(result)
}

async function sendAlert(failed, ts) {
  const lines = failed.map(c => `• ${c.name}: ${c.detail} (${c.ms}ms)`).join('\n')
  const html  = failed.map(c =>
    `<li><strong>${c.name}</strong>: ${c.detail} <span style="color:#888">(${c.ms}ms)</span></li>`
  ).join('')

  const body = {
    from:    'Finance Monitor <onboarding@resend.dev>',
    to:      process.env.ALERT_EMAIL,
    subject: `🔴 Finance App — ${failed.length} serviço(s) fora do ar`,
    text:    `Detectado em ${ts}\n\n${lines}\n\nVerifique: ${TARGET}`,
    html:    `
      <h2 style="color:#e53e3e">⚠️ Finance App com problemas</h2>
      <p>Detectado em <code>${ts}</code></p>
      <ul>${html}</ul>
      <p>URL: <a href="${TARGET}">${TARGET}</a></p>
      <hr>
      <p style="color:#888;font-size:12px">Finance Monitor — alerta automático</p>
    `,
  }

  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!r.ok) {
    const err = await r.text()
    throw new Error(`Resend HTTP ${r.status}: ${err}`)
  }

  console.log('[cron] Alerta enviado para', process.env.ALERT_EMAIL)
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
