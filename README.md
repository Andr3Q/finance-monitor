# Finance Monitor

Dashboard de monitoramento de infraestrutura do [Finance App](https://finance-app-1042158013294.southamerica-east1.run.app) — verificação em tempo real de disponibilidade, latência e status do banco de dados.

## O que monitora

| Serviço | O que verifica |
|---|---|
| **API** | Disponibilidade + tempo de resposta (`/health`) |
| **Banco de dados** | Status do Neon PostgreSQL (via retorno da API) |
| **Frontend** | Carregamento da interface React/Vite |

## Funcionalidades

- Auto-refresh a cada **30 segundos**
- Indicador de latência com cor (🟢 < 400ms · 🟡 < 1200ms · 🔴 acima)
- Histórico das últimas 8 verificações da sessão
- Banner de status geral (operacional / degradação detectada)
- Interface mobile-first, otimizada para iPhone
- Dark mode nativo

## Stack

- **Frontend:** HTML + CSS + JS puro (sem framework)
- **Backend:** Vercel Serverless Function (`api/status.js`)
- **Deploy:** Vercel (free tier)

A função serverless chama o Finance app do lado do servidor, evitando problemas de CORS e escondendo a URL interna do cliente.

## Estrutura

```
finance-monitor/
├── api/
│   └── status.js        # Serverless function — faz os checks
├── public/
│   └── index.html       # Dashboard (HTML/CSS/JS)
├── vercel.json          # Configuração de rotas
└── package.json
```

## Deploy local (desenvolvimento)

```bash
npm i -g vercel
vercel dev
```

Acesse `http://localhost:3000`.

## Projeto relacionado

Repositório do Finance App: [finance-app](https://github.com/Andr3Q/finance-app)
