# Deployment — Cronograma de Publicação

Plano de subida do bestiário na mesma VPS que já hospeda o `quartzo`. Segue o padrão bash + PM2 + Nginx + Postgres compartilhado do quartzo.

## Modelo de ameaça (por que várias coisas foram simplificadas)

**Os dados do bestiário não são valiosos.** Vazamento total do banco não geraria prejuízo — é catálogo de design de um jogo. O objetivo de segurança é **não vulnerabilizar os outros projetos da mesma VPS** (quartzo, o Postgres compartilhado, o SO).

Consequência prática para este cronograma:

| O que **importa** proteger (isolamento de perímetro) | O que **não** exige rigor |
|---|---|
| Role Postgres estritamente sem `SUPERUSER`/`BYPASSRLS` | Confidencialidade dos registros |
| Nenhum grant em DBs de outros serviços | Backup diário automatizado (semanal ou on-demand basta) |
| Processo PM2 como user não-root sem sudo | Alertas de uptime 24/7 |
| Nginx com `server_name` específico, sem catch-all | Sentry / rastreamento de erros sofisticado |
| Sem endpoints que executem shell / uploads arbitrários | Cifração de campos, auditoria fina |
| UFW mantendo só 22/80/443 externos | Testes de restore mensais |
| Rate limit leve (para não saturar a VPS) | Rate limit rigoroso (o Cloudflare na frente já cobre picos) |
| Logrotate para não encher disco e afetar vizinhos | Retenção longa de logs |

## Alvo

- **URL:** `https://bestiary.sysnode.com.br` (UI na raiz, API sob `/api/v1/*`)
- **VPS:** mesma do quartzo (Ubuntu 22.04)
- **Postgres:** mesma instância do quartzo (porta 5434) — novo DB `bestiary_prod` + role dedicada `bestiary_app`
- **TLS:** wildcard existente `*.sysnode.com.br` (verificar; senão emitir novo cert DNS-01)
- **Reverse proxy:** Nginx compartilhado (novo server block)
- **Processo:** PM2 gerenciando `apps/api`; `apps/web` é dist estático servido pelo Nginx
- **Deploy:** `scripts/deploy.sh` manual via SSH
- **Backup:** *opcional na primeira leva* — se ligar, semanal + on-demand antes de deploys grandes

## Portas

Para não colidir com quartzo (`5601` core, `5602` chat, `5603` evolution, `5434` postgres, `6381` redis):

| Serviço | Porta interna |
|---|---|
| API bestiário (PM2) | **5610** |
| Postgres | 5434 (compartilhado) |

Nenhuma nova porta exposta externamente — UFW segue `22/80/443`.

---

## Cronograma

Total estimado: **~7h** de trabalho concentrado (1 dia útil com folga). Encolheu de ~11h para ~7h por causa do modelo de ameaça — o que caiu está listado no rodapé.

### Fase 0 — Alinhamento *(feito nesta conversa)*

Decisões travadas:

- ✓ VPS compartilhada com quartzo
- ✓ Postgres compartilhado (novo DB dentro da mesma instância)
- ✓ Subdomínio `bestiary.sysnode.com.br`
- ✓ Deploy manual estilo quartzo (bash + PM2, sem CI/CD por ora)
- ✓ Modelo de ameaça: proteger vizinhos, não os dados

### Fase 1 — Preparo do repositório para produção *(≈1h30)*

Ajustes de código antes de qualquer coisa de infra.

1. **`GET /health` no api** — endpoint público, sem X-API-Key, retorna `200 {"ok":true,"db":"up"}` após um `SELECT 1`. Necessário para `deploy.sh` fazer healthcheck retry pós-reload.
2. **CORS restrito em produção** — hoje `origin: true`. Trocar para ler `CORS_ORIGIN` do env; em prod aceitar apenas `https://bestiary.sysnode.com.br`. Não é para proteger dados — é higiene mínima para o browser não permitir credenciais de outros sites do domínio.
3. **`env.ts` — novos campos:** `CORS_ORIGIN`, `NODE_ENV`.
4. **`.env.production.example`** — template com as vars de produção. Documenta cada campo.
5. **`apps/web` build config** — garantir `base: "/"`, output em `dist/` limpo, sem source maps.
6. **Rate limit leve nas rotas de escrita** — `express-rate-limit` com **300 req/min por IP** nas rotas com `requireApiKey`. Objetivo: evitar que um agente bugado sature CPU/DB e afete o quartzo. Não é para proteger dados. Leitura fica sem limite (Cloudflare cobre picos).

**Critério de aceite:** `pnpm typecheck && pnpm build` limpo. `curl localhost:5101/health` responde 200.

### Fase 2 — Scripts de infra no repositório *(≈3h)*

Espelham a estrutura `infra/` + `scripts/` do quartzo.

**Novos arquivos:**

```
game/
├── ecosystem.config.cjs        # PM2 config para apps/api
├── infra/
│   ├── nginx/
│   │   └── bestiary.conf       # server block: 443 → PM2 5610 + dist estático
│   └── postgres/
│       └── init-bestiary.sql   # CREATE DATABASE + CREATE ROLE (one-off)
├── scripts/
│   ├── deploy.sh               # pull → install → build → migrate → pm2 reload → healthcheck
│   └── backup-pg.sh            # (opcional) pg_dump | gzip | rclone → R2
└── docs/
    ├── DEPLOYMENT.md           # este arquivo
    └── VPS_RUNBOOK.md          # onde encontrar logs, como reverter, como ver status
```

**`ecosystem.config.cjs`** — PM2 com **1 instância** (volume não justifica cluster) e restart em `400M`:

```js
module.exports = {
  apps: [{
    name: "bestiary-api",
    script: "apps/api/dist/index.js",
    instances: 1,
    max_memory_restart: "400M",
    env: { NODE_ENV: "production" },
    error_file: "/srv/bestiary/logs/api.err.log",
    out_file: "/srv/bestiary/logs/api.out.log",
  }],
};
```

**`scripts/deploy.sh`** — porta do padrão quartzo:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/bestiary/current
git fetch --tags && git reset --hard origin/main
pnpm install --frozen-lockfile
pnpm build                             # web + api
pnpm db:migrate                        # drizzle-kit, transacional
pm2 reload ecosystem.config.cjs --update-env
# healthcheck retry
for i in {1..10}; do
  curl -sfo /dev/null https://bestiary.sysnode.com.br/health && exit 0
  sleep 3
done
echo "healthcheck failed"; exit 1
```

**`infra/nginx/bestiary.conf`** — server 443 seguindo padrão quartzo:
- `server_name bestiary.sysnode.com.br;` (**específico**, sem catch-all)
- HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Cache imutável para `/assets/*`, no-cache para `index.html`
- Proxy `/api/*` para `localhost:5610`
- Não repete o `redirect 80→443` — o quartzo já tem bloco default

**Critério de aceite:** scripts commitados, `chmod +x`, shellcheck limpo.

### Fase 3 — Setup inicial na VPS *(≈1h30, one-time via SSH)*

Ações manuais, uma vez. Documentar em `docs/VPS_RUNBOOK.md`.

1. **Criar DB e role no Postgres** — **crítico para isolamento**:
   ```sql
   -- Rodar como postgres superuser
   CREATE ROLE bestiary_app WITH LOGIN PASSWORD '<qualquer coisa>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
   CREATE DATABASE bestiary_prod OWNER bestiary_app;
   -- Garantia: revogar acesso público padrão
   REVOKE ALL ON DATABASE bestiary_prod FROM PUBLIC;
   GRANT CONNECT ON DATABASE bestiary_prod TO bestiary_app;
   ```
   Depois validar que `bestiary_app` NÃO consegue conectar em outros DBs:
   ```bash
   PGPASSWORD='...' psql -h localhost -p 5434 -U bestiary_app -d quartzo_prod -c '\dt'
   # esperado: permission denied. Se conectar, GRANT foi mal feito.
   ```
2. **Usuário de sistema** — não rodar deploy como root. Usar o user do dia-a-dia da VPS (o mesmo `$USER` que faz SSH — na sysnode é `elora`). PM2 herda o user; se rodar como root, isso VIRA vulnerabilidade que afeta os vizinhos.
3. **Diretórios em `/srv/bestiary/`** — atenção: só `logs` e `backups` são criados pelo mkdir; `current` fica para o `git clone` criar (senão o clone falha com "Permission denied" porque o diretório já existe vazio, dono root):
   ```bash
   sudo mkdir -p /srv/bestiary/{logs,backups}
   sudo chown -R $USER:$USER /srv/bestiary
   ```
4. **Clone inicial:**
   ```bash
   cd /srv/bestiary && git clone https://github.com/FellipeMoura/game current
   ```
5. **`.env.production` na VPS** (fora do repo, `/srv/bestiary/current/.env`):
   ```
   NODE_ENV=production
   DATABASE_URL=postgres://bestiary_app:<senha>@localhost:5434/bestiary_prod
   API_KEY=<qualquer 24+ chars random>
   API_PORT=5610
   CORS_ORIGIN=https://bestiary.sysnode.com.br
   FONTES_DIR=./fontes
   ```
6. **Cloudflare DNS:** A record `bestiary → <IP da VPS>`, proxy laranja on.
7. **Nginx:**
   ```bash
   sudo ln -s /srv/bestiary/current/infra/nginx/bestiary.conf /etc/nginx/sites-enabled/bestiary
   sudo nginx -t && sudo systemctl reload nginx
   ```
8. **TLS:** `sudo certbot certificates` para checar se o wildcard cobre. Se não, emitir com `certbot certonly --dns-cloudflare -d bestiary.sysnode.com.br`.
9. **Logrotate** — mais para não encher o disco e afetar vizinhos do que para segurança dos logs:
   ```
   # /etc/logrotate.d/bestiary
   /srv/bestiary/logs/*.log {
     daily rotate 14 compress delaycompress missingok notifempty
   }
   ```

**Critério de aceite:**
- `psql -h localhost -p 5434 -U bestiary_app bestiary_prod -c '\dt'` conecta
- `psql ... -U bestiary_app quartzo_prod` **falha** com permission denied
- `ps aux | grep node` mostra o processo rodando como `$USER` (não `root`)
- Nginx serve `bestiary.sysnode.com.br` (502 esperado — PM2 ainda não subiu)

### Fase 4 — Primeiro deploy *(≈1h)*

1. SSH na VPS, `cd /srv/bestiary/current`.
2. Rodar `scripts/deploy.sh`. Esperado:
   - install (~1 min)
   - build (~30s)
   - migrate cria as 15 tabelas
   - seed **não** roda automaticamente — rodar manual uma vez: `pnpm db:seed` (popula o lote curado de arthropods; sem fontes, avisa `[skip]` e prossegue)
   - pm2 sobe processo, healthcheck passa
3. **Smoke tests:**
   ```bash
   curl https://bestiary.sysnode.com.br/health
   curl https://bestiary.sysnode.com.br/api/v1/elements
   curl https://bestiary.sysnode.com.br/api/v1/creatures
   ```
4. Abrir `https://bestiary.sysnode.com.br/bestiary/CRT-001` no browser.
5. **Teste do rate limit:** disparar 400 requests em 1 min contra rota de escrita — as últimas devem retornar `429`.

**Critério de aceite:** curls devolvem 200 com payload esperado. UI renderiza a ficha. Rate limit ativa.

### Fase 5 — Higiene mínima *(≈45min)*

O que **precisa** existir para não deixar sujeira no servidor:

1. **`docs/VPS_RUNBOOK.md`** — documentar:
   - Como ver logs (`pm2 logs bestiary-api`, `tail -f /srv/bestiary/logs/*.log`)
   - Como reverter (`git reset --hard <sha>` + `deploy.sh`)
   - Como rodar seed manual
   - Como fazer backup sob demanda: `pg_dump -h localhost -p 5434 -U bestiary_app bestiary_prod > snapshot.sql`
   - Como parar tudo se precisar (`pm2 stop bestiary-api`)
2. **Snapshot manual antes de deploys arriscados** — comando pronto no runbook, sem cron.
3. **Log rotation ativado** (já feito na fase 3).
4. **Confirmar que `pm2 startup`** foi feito no user `deploy` — se a VPS reiniciar, o bestiário volta sem intervenção. Não custa nada e evita ligar o servidor às 3h da manhã.

**Critério de aceite:** runbook existe, `pm2 save && pm2 startup` executados, log rotation configurado.

### *(Opcional)* Fase 6 — Se quiser mais tarde

Coisas que **não** entram na primeira leva por causa do modelo de ameaça, mas ficam fáceis de adicionar depois:

- **Backup semanal automatizado** para R2 (reusar o rclone do quartzo). Adicionar um cron `0 3 * * 0` chamando `scripts/backup-pg.sh`.
- **Uptime Kuma** apontando para `/health` com alerta por e-mail.
- **Sentry** — só se aparecer volume real de erros para justificar.
- **CI leve** — GitHub Actions rodando `pnpm typecheck && pnpm build` em PR (não bloqueia merge, só sinaliza).

---

## Riscos e mitigações

Recalibrados para o modelo de ameaça. Riscos que só afetam o próprio bestiário viraram *aceitáveis*; riscos que ameaçam os vizinhos ficaram como bloqueadores.

| Risco | Afeta vizinhos? | Mitigação |
|---|---|---|
| `bestiary_app` com privilégio a mais | **Sim** | `NOSUPERUSER NOBYPASSRLS NOCREATEDB`; teste explícito na fase 3 |
| PM2 rodando como root | **Sim** | Fase 3, item 2 — user `deploy` |
| Nginx com catch-all engolindo outros hosts | **Sim** | `server_name` específico, `nginx -t` antes de reload |
| Migration falha em prod | Não (só bestiário) | Aceitável; deploy.sh sai antes do reload, apps continuam versão antiga |
| Bestiário cai | Não | Aceitável — corrigir quando notar |
| Dados vazam | Não | Aceitável — não são valiosos |
| API sobrecarregada satura CPU/DB | **Sim** (afeta quartzo) | Rate limit 300 req/min por IP; PM2 `max_memory_restart 400M` |
| Log enche disco | **Sim** | Logrotate diário, 14 dias |
| Conflito de porta | Sim (deploy quebra) | 5610 escolhida; `ss -tlnp \| grep 5610` antes de subir |
| Cert wildcard não cobre | Não (bestiário 502) | Fallback: `certbot --dns-cloudflare` |

## Fora do escopo desta primeira leva

Sem justificativa dado o modelo de ameaça:

- CI (typecheck/build em PR)
- Deploy automático em push para main
- Cluster PM2 / múltiplas instâncias
- Backup diário obrigatório (semanal opcional na fase 6)
- Uptime monitor obrigatório (opcional na fase 6)
- Sentry
- Cifração de campos
- Auditoria de acesso ao banco
- Autenticação de usuário

## Checklist enxuto (para colar em issue)

- [ ] Fase 1: `/health`, CORS, `.env.production.example`, rate limit leve
- [ ] Fase 2: `deploy.sh`, `ecosystem.config.cjs`, `infra/nginx/bestiary.conf`
- [ ] Fase 3: DB + role `NOSUPERUSER`, user `deploy` não-root, `/srv/bestiary/`, DNS, Nginx, TLS, logrotate — validar que `bestiary_app` **não** conecta em `quartzo_prod`
- [ ] Fase 4: primeiro `deploy.sh`, `pnpm db:seed` manual, smoke tests + rate limit
- [ ] Fase 5: `docs/VPS_RUNBOOK.md`, `pm2 save && pm2 startup`
