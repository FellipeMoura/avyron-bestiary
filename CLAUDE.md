# CLAUDE.md — briefing para sessões do Claude Code

Contexto essencial para trabalhar neste repositório. Leitura obrigatória antes de propor mudanças. Complementa o `README.md` (que foca em como rodar).

## O que é isto

App web de catálogo/documentação de um jogo 3D de coleção de criaturas com tema paleontológico. **Este repositório NÃO é o jogo** — o jogo em Godot vive em um repositório irmão em `c:\code\fellipe\avyron` e não deve ser tocado a partir daqui. A ponte entre os dois é `pnpm game:export`, que escreve um bundle JSON versionado lá.

O jogo chama-se **Avyron**: Godot, câmera isométrica ortográfica travada em 30°/45°, exploração em tempo real e **combate por turnos** (1v1 com troca livre, in-world, sem arena separada).

**Nomenclatura in-world.** As classes são Loricati, Theria e Draconis; as eras são Aetheris, Titanor e Novaterra. Esses são nomes de *exibição* — os códigos (`CLS-*`) e os enums do banco (`paleozoic`, `mesozoic`, `cenozoic`) seguem inalterados. O escopo biológico real de cada classe vive em `creature_classes.biologicalScope`, e as eras traduzem por `ERA_LABEL` em `labels.ts`. Ver documento `nomenclatura`.

**Dois públicos com necessidades opostas:**
- **Humanos leem** o bestiário, mapas, lore e histórico na UI. O frontend não tem formulário de edição, painel admin ou login de usuário — não existe CRUD genérico nem sessão de usuário.
- **Agentes de IA escrevem** conteúdo via API.

Isso não proíbe uma ação pontual e específica disparada por um botão no frontend (ex.: um botão que dispara uma sincronização já implementada na API) — o que se evita é construir telas de edição genéricas (CRUD, sessão, edição concorrente no navegador) sem necessidade real. Toda lógica de escrita, changelog e versão continua vivendo exclusivamente na API, nunca inline no frontend.

## Modelo de ameaça

**Os dados do bestiário não são valiosos.** Vazamento total do banco não geraria prejuízo — é catálogo de design de um jogo, nada pessoal, nada financeiro. Isso muda como pensamos segurança:

- **O que importa proteger:** os vizinhos do servidor. Uma vulnerabilidade no bestiário não pode ser trampolim para o quartzo, o Postgres compartilhado, ou o sistema operacional.
- **O que NÃO precisa de rigor:** confidencialidade dos dados, integridade forte, backup diário obsessivo, alertas 24/7.
- **Consequência prática:** role Postgres `bestiary_app` estritamente sem `SUPERUSER`/`BYPASSRLS` e sem grants em outros DBs; processo PM2 rodando como user não-root sem sudo; sem endpoints que executem comandos de shell / uploads arbitrários; UFW seguindo o padrão da VPS (só 22/80/443); Nginx com `server_name` específico, sem catch-all. Rate limit leve ainda vale — protege a VPS de saturar, não os dados.

Ao propor mudanças, calibrar por este modelo. Não perder tempo com criptografia de campos, auditoria fina, backup horário; **não** relaxar isolamento de perímetro.

## Stack

Monorepo pnpm workspaces:

- **`apps/api`** — Node + TypeScript + Express + Drizzle + Zod + zod-to-openapi + PostgreSQL
- **`apps/web`** — Vite + React 19 + React Router 7 + TanStack Query + Tailwind + openapi-fetch
- **`packages/db`** — schemas Drizzle e migrations. O `seed/` está **congelado** (ver abaixo).
- **`scripts/export-game-data.mjs`** — export build-time do bundle para o repo Godot

**Não usamos:** Docker em prod, Redis, BullMQ, Socket.io, MinIO, RLS multi-tenant, JWT, OAuth, migrations com Alembic-like, rate limiting. Padrão inspirado no `c:\code\saas\frostie` mas enxuto.

Portas: web 5100, api 5101, postgres 5102.

## Regras invioláveis

Estas quatro regras não têm exceção. Se algo parecer conflitar com elas, elas ganham.

1. **Lógica de escrita só vive na API.** Toda transação, changelog e cálculo de versão fica em `apps/api` — nunca inline no frontend ou em script solto. O frontend não tem formulário de edição/CRUD genérico, mas pode disparar uma ação de escrita pontual e já implementada na API (ex.: um botão que chama um endpoint específico), com `x-api-key` de dev configurada via `VITE_API_KEY`.
2. **Terminologia travada.** Termo oficial: **"Despertar Ancestral"** (transformação temporária, retorno à forma base). Os termos **"Evolução"** e **"Forma Ancestral"** estão descontinuados. Middleware `rejectForbiddenTerms` scaneia todo body de escrita e retorna `422` se achar essas expressões em qualquer campo de texto, apontando o campo ofensor. Ver `apps/api/src/shared/services/terminology.ts`.
3. **Toda escrita gera changelog na mesma transação.** Campos `reason` e `impact` são obrigatórios em todo body de POST/PATCH. O servidor grava a entrada de changelog e incrementa a versão (formato `0.NN`) sozinho — agente **nunca** escolhe a versão. Ver `apps/api/src/shared/services/changelog.ts`.
4. **Economia de tokens é requisito funcional.** Quem consome a API é LLM pagando por token. `POST` responde só `{"code","version"}`. `GET` aceita `?fields=code,name`. Erros nomeiam campo e valores válidos: `"classCode: 'CLS-999' does not exist"`, não `"invalid"`.

5. **O seed está congelado.** Passo a passo de inserção de dados: [docs/DATA_WORKFLOW.md](docs/DATA_WORKFLOW.md). `packages/db/src/seed/` existiu para tirar o corpus dos `.docx`/`.xlsx` antes do primeiro deploy. Esse trabalho acabou. **Nunca adicionar lote de conteúdo novo lá.** Conteúdo entra pela API — que gera changelog e versão sozinha. Conteúdo commitado como TypeScript não tem nem um nem outro. Para hidratar uma máquina, `pnpm db:restore`.

6. **Toda escrita termina em `pnpm db:dump`.** O banco é um container local; o durável é `packages/db/snapshot/` commitado. Sem o dump, o catálogo existe numa máquina só e não está no git. O snapshot **não** contradiz a regra 5: ele é o resultado de escritas que já passaram pela API e já geraram changelog — a tabela `changelog` está dentro dele.

## Naming (aprendido na marra)

- **Código = inglês:** tabelas (`creatures`, `awakenings`, `creature_classes`, `game_maps`, `design_documents`), colunas (`original_name`, `activation_chance_pct`), endpoints (`/api/v1/creatures/{code}`), variáveis, componentes, pastas.
- **Colisões TS resolvidas:** `CreatureClass` (não `Class`), `GameMap` (não `Map`), `DesignDocument` (não `Document`).
- **UI = português:** títulos, botões, labels, mensagens de estado, mensagens de erro. Nunca inline nas rotas — passa por `apps/web/src/lib/labels.ts`.
- **Conteúdo do domínio = português:** valores em campos de texto (nomes de criaturas, notas, corpo dos documentos, motivo/impacto do changelog).
- **Enums no banco = inglês** (`reinforcement`, `swap`, `paleozoic`), traduzidos na apresentação via `labels.ts` (`AWAKENING_TYPE_LABEL`, `ERA_LABEL`, `DOCUMENT_STATUS_LABEL`).
- **Prefixos de código dos dados** preservados dos fontes originais em português: `CRT`, `DSP`, `ELE`, `CLS`, `BIO`, `HAB`, `ITM`, `NPC`, `MIS`, `DRP`. São valores, não código.

## Convenções por camada

**API — feature-folder por recurso** em `apps/api/src/modules/<feature>/`:
- `{Feature}Types.ts` — Zod schemas com `.openapi()` (single source of truth para validação + docs)
- `{Feature}Service.ts` — data access, escreve dentro de `db.transaction` com `recordChange`
- `{Feature}Controller.ts` — thin, delega para Service, `satisfies RequestHandler`
- `{Feature}Routes.ts` — Express router + `registerPath` no `registry`

**Quatro helpers reduzem boilerplate** em `apps/api/src/shared/services/`:
- `crudFactory.ts` — gera list/get/create/update/batchCreate para tabelas SEM FKs (elements, biomes, items, creature-classes)
- `crudRoutes.ts` — gera as 5 rotas padrão + registerPath OpenAPI a partir dos schemas
- `childUpsertFactory.ts` — para tabelas 1:1 filhas de um pai com `code`, endereçadas pelo código do pai e escritas por upsert (creature-stats, ability-stats, capture-rules)
- `childUpsertRoutes.ts` — as 4 rotas desse padrão: list, get-by-parent-code, upsert, batch

**Quando NÃO usar factory:**
- Recursos com FK (creatures, awakenings, missions, npcs, abilities, drops, junctions) — Service manual porque precisa resolver códigos para ids dentro da transação via `resolveCodeInTx` (`apps/api/src/shared/services/fkResolver.ts`)
- Awakenings tem constraint 1-para-1 em `creatureCode` — POST em criatura que já tem despertar responde `409`
- Junções (`drops`, `map-biomes`, `elemental-advantages`) usam semântica upsert (`onConflictDoUpdate`), sem PATCH/DELETE

**Endpoints especiais:**
- `GET /context` — snapshot markdown compacto (terminologia + elementos + classes + contagens + últimas 5 versões). Primeira leitura de qualquer agente escritor.
- `GET /documents/{slug}` — content negotiation: `Accept: text/markdown` devolve texto puro, senão JSON com envelope.

## Regras de domínio (não estão no código)

- **Elenco fechado em 3 classes:** Loricati (CLS-001, artrópodes), Theria (CLS-002, sinapsídeos), Draconis (CLS-003, sauropsídeos). Criatura que não cabe em nenhuma delas não entra no jogo. "Vertebrados Primitivos" e "Incertos" foram removidas.
- **Classes não têm matriz de vantagem entre si.** Hard rule do Changelog 0.01 — nunca adicionar campo de dano/multiplicador em `creature_classes`; não existe ciclo tipo o elemental entre classes. Refinado pelo sistema de Relicário: um *equipamento* pode conceder bônus de captura vinculado à classe, mas isso é propriedade do equipamento, não uma relação de força CLS×CLS. O Relicário **não** concede mais buff de combate (removido do escopo do sistema — ver `relicario`). Ver `classes`, `captura`, `relicario`.
- **Elementos SIM, em anel fechado:** Água → Fogo → Natureza → Terra → Gelo → Eletricidade → Água (seta = vence). Vantagem 2.0, desvantagem 0.5, resto 1.0 por omissão. Cada elemento vence exatamente um e perde para exatamente um — a simetria é o ponto, não um acidente.
- **Criatura ↔ Despertar é 1-para-1.** Tabela `awakenings` tem `UNIQUE(creature_id)`. Ausência de linha = criatura sem despertar. Hoje a cobertura é 26/26.
- **3 eras, cada uma dividida em 3 submapas (9 mapas no total).** Cada submapa é um `game_map` próprio (`era` compartilhada, `code` sequencial: `PZ-01/02/03`, depois `MZ-*`, `CZ-*`) e representa um bloco cronológico/ecológico, não um único período geológico rígido. Aetheris já formalizada: PZ-01 "Aetheris I — Mundo dos Mares" (Cambriano-Ordoviciano), PZ-02 "Aetheris II — Conquista das Margens" (Siluriano-Devoniano), PZ-03 "Aetheris III — Domínio Terrestre" (Carbonífero-Permiano), macroprogressão MAR → MARGEM → TERRA. `~20 criaturas inéditas` segue como meta agregada por era — a distribuição entre os 3 submapas dela ainda não foi decidida. Reaparições em mapas posteriores não contam para o limite.
- **Regra 70/30** do Despertar Ancestral: ~70% "reforço" (mesma espécie amplificada, multiplicador 1.5), ~30% "troca" (vira outra espécie relacionada, multiplicador 1.7).
- **Subir de nível pede XP _e_ material.** As duas condições juntas, nunca só uma. O material é o item `category: "material"` da classe da **própria criatura que sobe** (um por classe: ITM-019 Loricati, ITM-020 Theria, ITM-021 Draconis), e ele cai de criatura selvagem derrotada — a classe do **derrotado** decide qual item sai, não a de quem venceu. Isso é categorização de loot, não combate: a regra de que classes não influenciam combate continua valendo. Ver documento `progressao`.
- **Silhueta é critério de corte** — cada criatura deve ser reconhecível pela sombra, projetada em 30°/45°.

## Camada de números (o que o jogo consome)

Estas tabelas separam o catálogo editorial dos valores que o jogo executa.

- `combat_rules` — **singleton** (`id = 1`, garantido por CHECK). As constantes de tuning: escala de dano, variância, taxas de enchimento da carga, limites de captura, teto de nível. `GET /combat-rules` e `PATCH /combat-rules` — sem código, sem lista, sem POST. **É aqui que se balanceia o jogo.**
- `progression_rules` — **singleton**. As constantes de subida de nível: curva de XP, divisor do XP concedido, custo de material por nível. `GET /progression-rules` e `PATCH /progression-rules`. Mesmo contrato de `combat_rules`.
- `creature_stats` — 1:1 com criatura. `baseHp`, `baseAttack`, `baseDefense`, `baseSpeed`, `baseCharge`, `growthRate`, `xpYield`. Valor efetivo: `floor(base * (1 + growthRate * (nível - 1)))`.
- `ability_stats` — 1:1 com habilidade. `power` 0 = movimento de status; `effectCode` é o switch que o Godot roda.
- `capture_rules` — 1:1 com criatura. `catchRate` 1–255.
- `creature_abilities` — junção: qual criatura sabe qual golpe, em que nível.
- `item_stats` — 1:1 com item. `value` (preço de compra) e o par `effectCode`/`effectValue`, que é o switch que o Godot roda ao usar o item. Mesmo contrato de `ability_stats`.
- `economy_rules` — **singleton**. Nome da moeda (`Óbolo`), bolsa inicial, e `sellRatio`: a fração do `value` que o comerciante paga ao comprar do jogador. O CHECK trava em (0, 1) — em 1.0 o jogador lucraria comprando e revendendo em loop.
- `merchant_offers` — junção npc × item: o catálogo de cada comerciante. `price` nulo cobra `item_stats.value`, o que faz um segundo vilarejo mais caro custar dado em vez de código.

As junções e as tabelas 1:1 usam upsert — re-POST para mudar, sem PATCH. `combat_rules` e `economy_rules` são a exceção: sendo singletons, PATCH é a operação natural.

**Enums que decidem comportamento no jogo**, não rótulos:
- `item_category` (`mineral`, `capture`, `heal`, `material`) — o export filtra minério nesta coluna. Era texto livre, e por isso `mining.items` recebia a tabela inteira: o primeiro item de comerciante teria sido exportado como minerável. `material` é o drop de combate gasto na subida de nível — fica fora de `mineral` pelo mesmo motivo.
- `item_effect` (`none`, `capture_bonus`, `heal_flat`, `heal_percent`).
- `npc_role` (`merchant`, `duelist`, `quest`, `flavor`) — decide qual tela o jogo abre ao interagir.

**Dano:** `floor((power * attack / defense) * damageConstant * multElemental * random(varianceMin, varianceMax))`, com piso em `damageMinimum`.
**Carga do Despertar:** enche com dano recebido (×`chargeTakenMultiplier`) e causado (×`chargeDealtMultiplier`), escalado por `baseCharge / chargeNeutralCharge`. Cheia em `chargeMax`, dura 3 turnos, zera na reversão. Receber enche mais que causar — deliberado, para o Despertar ser virada de jogo e não amplificador de vitória.

Nenhuma dessas constantes está escrita em código. O jogo lê o bloco `rules` do bundle, e o bundle lê `combat_rules`. Mudar balanceamento é um PATCH versionado, não um commit.

**A contagem de tabelas não é regra.** Cinco é o que o jogo precisa hoje; se um sistema novo pedir mais, crie.

Especificação legível para humanos: documentos `combate`, `carga-e-despertar` e `captura` na API.

## Frontend visual

Direção: **arquivo científico dark editorial**. Não é padrão frostie/shadcn — tokens próprios em `apps/web/tailwind.config.ts`:

- Paleta: `void #0A0B0D`, `slate`, `bone`, `moss`, `graphite`, `ember`
- Fontes: Space Grotesk (display) + JetBrains Mono (códigos) + Inter (body)
- Cards angulares (radius 0-2px), sem sombra, escala tipográfica não-linear
- **`ember` é o único acento quente.** Regra: máximo 1 uso por tela, nunca como fundo de botão
- **A ficha de criatura é o único lugar com peso visual.** Hero number CRT-XXX em display XL + barra `moss` de escala à esquerda. Bestiário/docs/changelog ficam quietos.
- Piso: `prefers-reduced-motion` respeitado, foco de teclado visível (`outline ember`), `bone` só ≥14px (abaixo cair para `#F5F1E6`)

## Comandos frequentes

```powershell
pnpm dev                  # sobe api + web em paralelo
pnpm typecheck            # três workspaces
pnpm db:dump              # grava packages/db/snapshot/ — rode depois de toda escrita
pnpm db:restore           # migrations + snapshot; hidrata uma maquina do zero
pnpm db:studio            # drizzle-kit GUI para inspecionar
pnpm openapi:generate     # regera schema.d.ts do web a partir da API rodando
pnpm game:export          # gera o bundle JSON no repo Godot irmão
pnpm models:optimize      # comprime .glb novo para KTX2 — rode ao adicionar modelo
pnpm db:seed              # CONGELADO — bootstrap offline, não usar para conteúdo novo
pnpm db:reset             # create + generate + migrate + seed (setup do zero, sem dados de prod)
```

`pnpm game:export` aceita `--from <url>` (default API local) e `--out <path>` (default `../godot`). Ele **falha** se alguma criatura estiver sem stats, sem regra de captura ou sem golpes — em vez de gerar um bundle que quebra o jogo em runtime.

## Coisas para NÃO fazer

- Não adicionar campo de combate em `creature_classes`.
- Não adicionar lote de conteúdo em `packages/db/src/seed/`. Está congelado — conteúdo entra pela API.
- Não criar criatura fora das três classes. Se não é artrópode, sinapsídeo ou sauropsídeo, está fora do escopo.
- Não citar os termos descontinuados em documento, nem para explicar que estão descontinuados. Foi exatamente assim que o documento `despertar-ancestral` se corrompeu: o replace automático do import reescreveu as citações e produziu uma frase dizendo que o termo oficial estava descontinuado. A lista vive em `terminology.ts`, que sabe a diferença entre usar um termo e falar sobre ele.
- Não usar "Evolução" ou "Forma Ancestral" em nenhum lugar — código, comentário, exemplo, mock, teste. Se aparecer em texto vindo de fora (tabela do usuário, docx importado), fazer replace automático `Evolução → Despertar`, `Forma Ancestral → Despertar Ancestral` no ato do import.
- Não escrever changelog manualmente pelo lado do agente/frontend. Sempre `recordChange(tx, ...)` dentro da transação do write.
- Não devolver o objeto criado inteiro em `POST` — só `{code, version}`. O agente já enviou; devolver duplica tokens.
- Não usar shadcn/ui. Componentes trazem radius e paleta que brigam com a direção visual — mais retrabalho refinar do que HTML nativo + Tailwind.
- Não instalar Alembic, Prisma, tRPC, GraphQL, MinIO, Redis, Docker Compose. Se propuser algo que puxe uma dessas, questionar antes.
- **Não presumir sufixo `.vN` em nome de modelo.** A convenção mudou: os arquivos são `CRT-XXX.glb`, sem versão no nome. Quem escrever seletor de modelo deve casar `CRT-XXX.glb` puro — foi assim que o antigo `publish-models.mjs` virou no-op silencioso, imprimindo "nothing to do" e saindo com sucesso.
- **Não criar script que escreva em host remoto.** O escopo é estritamente a máquina local: API em `localhost:5101`, Postgres no container da 5102, durável em `packages/db/snapshot/`. `publish-models.mjs` e `migrate-docs-to-prod.mjs` foram removidos por apontarem para o `bestiary.sysnode.com.br` desligado. A receita de religar o VPS continua em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) e [docs/VPS_RUNBOOK.md](docs/VPS_RUNBOOK.md) — é referência histórica, não caminho de trabalho.
- **Não servir `.glb` do Meshy sem passar por `pnpm models:optimize`.** O arquivo cru custa ~89 MB de VRAM por criatura, e o `KHR_texture_basisu` que o script marca como obrigatório é o que o `CreatureViewer` espera. Ver [docs/MODEL_OPTIMIZATION.md](docs/MODEL_OPTIMIZATION.md).
- **Não medir otimização de modelo por MB do arquivo.** Foi assim que a redução de 4k para 2k de textura pareceu não ter feito nada: ela economizou ~270 MB de VRAM por criatura sem mexer visivelmente no `.glb`, porque JPEG só comprime em disco — a GPU decodifica tudo para RGBA cru. Arquivo governa download; resolução e formato de textura governam VRAM. São dois problemas separados. A geometria é ~2% do arquivo, então mexer em contagem de polígonos não resolve nenhum dos dois.
- **Não remover uma textura emissiva sem zerar `emissiveFactor`.** Em glTF o emissivo é `emissiveFactor × emissiveTexture` — tirar a textura deixando o fator em `[1,1,1]` faz a criatura brilhar branco sólido e virar silhueta chapada. `scripts/optimize-models.mjs` zera o fator junto e se recusa a gravar se achar essa combinação; se mexer nesse trecho, mantenha a checagem.
- **Não criar tabela sem adicioná-la a `packages/db/src/tables.ts`.** Esquecer é silencioso da pior forma: o `db:dump` roda, reporta sucesso, e o snapshot sai sem ela — e como o restore usa a mesma lista, ninguém percebe até precisar dos dados. Foi exatamente o que aconteceu com a camada de números inteira enquanto essa lista morava dentro de um script: `creature_stats`, `ability_stats`, `capture_rules` e `creature_abilities` nunca estiveram nela, e toda máquina hidratada ficava com catálogo completo e zero números.
- **Não comparar versão (`0.NN`) como texto.** `'0.99' > '0.104'` em ordenação lexicográfica, então `ORDER BY version DESC` para de funcionar na centésima versão — e parou, silenciosamente, nos dois lugares que faziam isso. Use `LATEST_VERSION_SQL` de `tables.ts`.
- Não commitar arquivos de `./fontes/` (xlsx/docx). Cada dev traz sua cópia — `.gitignore` cobre.
- Não commitar `.env`. Só `.env.example` vai para o repo.

## Onde procurar informação

- **README.md** — como clonar e rodar
- **docs/DATA_WORKFLOW.md** — como inserir e corrigir dados via API (leitura obrigatória antes de escrever)
- **docs/MODEL_OPTIMIZATION.md** — como preparar um `.glb` do Meshy (leitura obrigatória antes de mexer em modelo ou textura)
- **`packages/db/src/tables.ts`** — a lista de tabelas que dump e restore compartilham, e o SQL de ordenação de versão
- **`packages/db/snapshot/`** — o conteúdo do catálogo, em JSONL diffável. É a cópia durável.
- **`packages/db/src/schema/`** — modelo de dados (19 tabelas + junctions + enums)
- **`packages/db/src/schema/stats.ts`** — a camada de números, com as fórmulas documentadas
- **`apps/api/src/shared/services/`** — as decisões arquiteturais principais (terminology, changelog, crudFactory, crudRoutes, childUpsertFactory, childUpsertRoutes, fkResolver, query)
- **`apps/api/src/modules/elements/`** — módulo de referência para o padrão sem FK
- **`apps/api/src/modules/creatures/`** — módulo de referência para o padrão com múltiplas FKs
- **`apps/api/src/modules/drops/`** — padrão upsert para junctions
- **`apps/api/src/modules/creatureStats/`** — padrão filho-1:1-por-código-do-pai
- **`scripts/export-game-data.mjs`** — o contrato de dados com o jogo
- **`apps/web/src/routes/CreatureDetail.tsx`** — a única tela com peso visual; referência da direção editorial
- **`apps/web/src/lib/labels.ts`** — todas as traduções enum → português
- **`fontes/README.md`** — o que vai na pasta ignorada
