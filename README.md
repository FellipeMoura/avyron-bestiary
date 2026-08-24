# Bestiário — App de Catálogo e Documentação

Web app que substitui `.docx`/`.xlsx` como fonte de verdade de um jogo 3D de coleção de criaturas com tema paleontológico. **Este repositório não é o jogo** — o jogo em Godot vive num repositório irmão, alimentado por `pnpm game:export`.

O jogo chama-se **Avyron**: Godot, câmera isométrica ortográfica travada em 30°/45°, exploração em tempo real e combate por turnos. As classes são Loricati, Theria e Draconis; as eras, Aetheris, Titanor e Novaterra — nomes de exibição, com os códigos e enums do banco inalterados.

## Dois públicos

- **Humanos leem** o bestiário, mapas, lore e histórico na UI. Frontend é 100% somente-leitura.
- **Agentes de IA escrevem** via API (`X-API-Key` + `reason`/`impact` obrigatórios). Não existe formulário de edição na UI.

## Stack

Monorepo pnpm com três workspaces:

- **`apps/api`** — Node + TypeScript + Express + Drizzle + Zod + `zod-to-openapi` + PostgreSQL. Feature-folders em `modules/<feature>/{Routes,Controller,Service,Types}.ts`.
- **`apps/web`** — Vite + React 19 + React Router 7 + TanStack Query + Tailwind + `openapi-fetch` (cliente TS gerado do `/openapi.json`).
- **`packages/db`** — schemas Drizzle, migrations e o **snapshot** do conteúdo. O seed está **congelado** (bootstrap offline apenas) — conteúdo novo entra pela API, e uma máquina se hidrata com `pnpm db:restore`.

**Sem** Docker em produção, Redis, BullMQ, Socket.io, MinIO, RLS, JWT, OAuth, rate limiting. Autenticação = header `X-API-Key` estático em rotas de escrita; leitura aberta.

## Primeiro clone

```powershell
# 1. deps
pnpm install

# 2. env — só precisa se ainda não existe .env
Copy-Item .env.example .env
#    ajuste API_KEY para algo próprio; DATABASE_URL já bate com o container abaixo

# 3. Postgres via Docker (dispensa psql local)
docker run -d --name pg-bestiary -e POSTGRES_PASSWORD=postgres -p 5102:5432 postgres:16

# 4. cria banco + aplica migrations
pnpm db:create && pnpm db:migrate

# 5. carrega o conteúdo versionado no repo — sem rede
pnpm db:restore

# 6. sobe API + UI em paralelo
pnpm dev

# 7. (opcional) regenerar tipos TS do OpenAPI real com a API rodando
pnpm openapi:generate
```

- **API:** `http://localhost:5101` (docs em `/openapi.json`)
- **UI:** `http://localhost:5100`

Se precisar rodar as etapas do banco separadamente:

```powershell
pnpm db:create      # cria o banco 'bestiary' via node
pnpm db:generate    # drizzle-kit gera drizzle/0000_*.sql se schema mudou
pnpm db:migrate     # aplica as migrations
pnpm db:seed        # CONGELADO — bootstrap offline a partir de ./fontes/
pnpm db:dump        # grava packages/db/snapshot/ — rode depois de toda escrita
pnpm db:restore     # migrations + snapshot; hidrata uma máquina do zero
pnpm db:studio      # inspecionar o banco via GUI
```

Todos os passos são idempotentes — pode rodar `db:seed` várias vezes sem duplicar.

## Sobre a pasta `fontes/`

Os arquivos originais do jogo (`.docx`, `.xlsx`) ficam em `./fontes/` mas **não são versionados** — cada dev traz sua cópia. O que roda offline sem eles:

- schemas do banco (packages/db/src/schema)
- migrations (packages/db/drizzle)
- lote curado do Paleozoico (packages/db/src/seed/content/paleozoic-batch-1.ts) — 16 criaturas + despertares que já são código, não dados externos

O que precisa dos fontes: as tabelas de referência (elementos, classes, mapas, biomas base) + os documentos da Design Bible + o histórico do xlsx. Sem os fontes, `pnpm db:seed` avisa `[skip]` mas os lotes curados ainda rodam.

## Regras invioláveis

1. **Write só via API.** Frontend nunca envia POST/PATCH/DELETE.
2. **Terminologia travada.** Termo oficial: **Despertar Ancestral**. Os termos *Evolução* e *Forma Ancestral* estão descontinuados — API rejeita com `422`. Ver `apps/api/src/shared/services/terminology.ts`.
3. **Toda escrita gera changelog** na mesma transação. `reason` e `impact` são obrigatórios no body. Servidor incrementa `version` (formato `0.NN`).
4. **Economia de tokens é requisito funcional.** `POST` devolve só `{"code": "...", "version": "..."}`. `GET` aceita `?fields=code,name`. Erros nomeiam campo e valores válidos.

## Portas

| Serviço | Porta |
|---|---|
| Web (Vite) | 5100 |
| API (Express) | 5101 |
| Postgres (host) | 5102 (→ 5432 no container) |

## Estrutura

```
game/
├── apps/
│   ├── api/                    Express + Drizzle + Zod + zod-to-openapi
│   │   └── src/
│   │       ├── modules/        feature-folders para cada recurso
│   │       ├── shared/         AppError, middleware, openapi registry, services
│   │       ├── app.ts, env.ts, index.ts
│   └── web/                    Vite + React 19 + TanStack Query + Tailwind
│       └── src/
│           ├── routes/         Home, Bestiary, CreatureDetail, Items, Documents, Changelog
│           ├── components/     AppShell, Filter, CreatureViewer
│           ├── hooks/useApi.ts
│           ├── lib/            api client, labels PT, cn helper
│           └── App.tsx, main.tsx, index.css
├── packages/db/                Drizzle schemas + seed
│   ├── src/
│   │   ├── schema/             15 tabelas + junções + enums
│   │   ├── seed/               xlsx.ts, docx.ts, content/paleozoic-batch-1.ts
│   │   ├── client.ts, migrate.ts, create-db.ts, loadEnv.ts
│   └── drizzle/                migrations SQL geradas
├── fontes/                     .docx/.xlsx originais (ignorados pelo git)
├── pnpm-workspace.yaml
├── package.json                scripts globais (dev, db:*, openapi:generate)
├── tsconfig.base.json
└── .env                        DATABASE_URL, API_KEY, API_PORT, FONTES_DIR
```

## Recursos da API

**Catálogo:** `elements`, `elemental-advantages`, `creature-classes`, `creatures`, `awakenings`, `maps`, `biomes`, `map-biomes`, `abilities`, `items`, `npcs`, `missions`, `drops`, `documents`, `changelog`.

**Camada de números** (o que o jogo executa): `combat-rules` e `economy-rules` (singletons de tuning), `creature-stats`, `ability-stats`, `capture-rules`, `creature-abilities`, `item-stats`, `mining-rates`, `merchant-offers`.

Mais o endpoint especial `GET /context` — snapshot markdown do estado do projeto, primeira leitura de qualquer agente.

Cada recurso normal expõe: `GET /` (com filtros + `?fields=` + paginação), `GET /{code}`, `POST /` (com `reason`/`impact`), `PATCH /{code}`, `POST /batch`. Junções (`drops`, `map-biomes`, `elemental-advantages`) e a camada de números usam semântica upsert — re-POST para mudar um valor, sem PATCH.

## Export para o jogo

```powershell
pnpm game:export                          # da API local para ../avyron
pnpm game:export --out <path>             # destino explícito
```

Gera `data/bestiary.json` no repo do Godot: um bundle com `dataVersion` (tirado do changelog), tudo endereçado por código — nenhum id numérico atravessa a fronteira. Build-time, não runtime: o jogo abre offline e cada build é rastreável até o estado exato do catálogo.

Junto com o bundle, o export **espelha em `<repo-godot>/models/` todo `.glb` referenciado por `modelUrl`** (deduplicado — placeholders compartilhados por várias criaturas são copiados uma vez), preservando o caminho da URL para o jogo resolver como `res://models/...`.

O export **aborta sem escrever nada** se alguma criatura estiver sem stats, sem regra de captura, sem golpes — ou com `modelUrl` apontando para arquivo que não existe.

## Modelos 3D placeholder

Enquanto os modelos definitivos não são animados, o elenco usa os packs CC0 do Quaternius em `placeholder_models/` (fontes `.blend` + glTF). `pnpm models:placeholders` os converte em `.glb` servíveis em `apps/web/public/models/placeholders/<grupo>/`, normalizando os clipes de animação para um vocabulário único (`Idle`, `Walk`, `Run`, `Attack`, `Attack2`, `HitReact`, `Death`…) e emitindo o `manifest.json` que a ficha lê.

O vínculo criatura ↔ modelo é N:1 e se faz na própria ficha (`/bestiary/:code`), pelo botão **"vincular/alterar modelo"** (dev only): lista os modelos por família, mostra cada um em 3D animado e, abaixo, quais criaturas já usam aquele corpo. Confirmar dispara o PATCH normal da API — changelog e versão automáticos.

**Props de bioma** seguem um pipeline paralelo: `pnpm models:biomes` prepara os packs de `placeholder_models/biomes/` para `apps/web/public/models/biomes/`. Dois lotes, dois tratamentos: o Stylized Nature MegaKit (Quaternius, CC0) vai para `megakit/` como `.gltf` com texturas reduzidas a 1024² e mantidas **compartilhadas** (empacotar em `.glb` duplicaria a textura da casca em cada árvore); os props aquáticos do Meshy (PZ-01) vão para `aquatic/` como `.glb` individuais — cada um tem textura própria — com o mesmo downscale e a checagem de emissivo do pipeline Meshy (remover textura emissiva exige zerar o `emissiveFactor`). Não há vínculo por criatura: o `game:export` espelha o diretório inteiro e a cena do mapa no Godot consome direto. O Kenney Nature Kit também está em `placeholder_models/biomes/` mas foi preterido: escala de miniatura (grade 1×1) e linguagem geométrica que briga com as criaturas.

`GET /documents/{slug}` faz content negotiation: `Accept: text/markdown` devolve markdown puro (token cheap); JSON caso contrário.

## UI (5 telas)

- `/bestiary` — lista com filtros era/classe/elemento sincronizados na URL
- `/bestiary/:code` — a ficha, com hero number CRT-XXX, viewer 3D em turntable (clipe `Idle` em loop, botão dev de vínculo de modelo) + comparador base ↔ despertar lado a lado
- `/items` — catálogo editorial e camada de números lado a lado: preço, preço de revenda derivado do `sellRatio`, par `effectCode`/`effectValue` lido na unidade certa, oferta de comerciante e peso de mineração por classe e bioma. Fecha com a legenda do que cada campo decide no jogo
- `/documents` + `/documents/:slug` — lista de capítulos com status colorido; reader com markdown renderizado
- `/changelog` — timeline vertical, motivo/impacto em duas colunas

Direção visual: dark editorial (`void`, `slate`, `bone`, `moss`, `graphite`, `ember`), Space Grotesk + JetBrains Mono + Inter, cards angulares sem sombra. A ficha é onde vale gastar peso visual; o resto fica quieto.
