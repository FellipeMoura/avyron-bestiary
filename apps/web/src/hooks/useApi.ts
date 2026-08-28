import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api/client";

// ---------------------------------------------------------------------------
// Small, hand-rolled hooks per resource. TanStack Query keys follow the
// `[resource, kind, ...params]` convention. Errors from openapi-fetch are
// thrown so React Query surfaces them via `.error`.
// ---------------------------------------------------------------------------

function unwrap<T>(res: { data?: T; error?: unknown }): T {
  if (res.error) throw new Error(JSON.stringify(res.error));
  if (res.data === undefined) throw new Error("Empty response");
  return res.data;
}

// ---------- elements ----------
export function useElements() {
  return useQuery({
    queryKey: ["elements", "list"],
    queryFn: async () => unwrap(await api.GET("/elements", { params: { query: {} } })),
  });
}

// ---------- creature classes ----------
export function useCreatureClasses() {
  return useQuery({
    queryKey: ["creature-classes", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/creature-classes", { params: { query: {} } })),
  });
}

// ---------- maps ----------
export function useMaps() {
  return useQuery({
    queryKey: ["maps", "list"],
    queryFn: async () => unwrap(await api.GET("/maps", { params: { query: {} } })),
  });
}

// ---------- creatures ----------
interface CreatureListParams {
  era?: "paleozoic" | "mesozoic" | "cenozoic";
  classCode?: string;
  elementCode?: string;
  mapCode?: string;
}

export function useCreatures(params: CreatureListParams = {}) {
  return useQuery({
    queryKey: ["creatures", "list", params],
    queryFn: async () =>
      unwrap(
        await api.GET("/creatures", {
          params: { query: { limit: 500, offset: 0, ...params } },
        }),
      ),
  });
}

export function useCreature(code: string | undefined) {
  return useQuery({
    queryKey: ["creatures", "detail", code],
    enabled: !!code,
    queryFn: async () =>
      unwrap(
        await api.GET("/creatures/{code}", { params: { path: { code: code! } } }),
      ),
  });
}

/**
 * Dev-only write action (see CLAUDE.md, regra 1): varre
 * `apps/web/public/models` no servidor e reconcilia `modelUrl` com o que
 * existe em disco. A chave de API vem de `VITE_API_KEY`, presente só no
 * `.env` local — nunca em build de produção.
 */
export function useSyncModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/creatures/sync-models", {
          headers: { "x-api-key": import.meta.env.VITE_API_KEY ?? "" },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatures"] });
    },
  });
}

/**
 * Dev-only write action (see CLAUDE.md, regra 1): aponta o `modelUrl` de uma
 * criatura para um placeholder compartilhado, via PATCH já existente na API.
 * `reason`/`impact` são exigidos pelo changelog — o servidor grava a entrada
 * e incrementa a versão sozinho.
 */
export function useSetCreatureModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      modelUrl: string;
      reason: string;
      impact: string;
    }) =>
      unwrap(
        await api.PATCH("/creatures/{code}", {
          params: { path: { code: input.code } },
          headers: { "x-api-key": import.meta.env.VITE_API_KEY ?? "" },
          body: { modelUrl: input.modelUrl, reason: input.reason, impact: input.impact },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatures"] });
    },
  });
}

// ---------- awakenings ----------
export function useAwakeningByCreature(creatureCode: string | undefined) {
  return useQuery({
    queryKey: ["awakenings", "by-creature", creatureCode],
    enabled: !!creatureCode,
    queryFn: async () => {
      const rows = unwrap(
        await api.GET("/awakenings", {
          params: { query: { creatureCode: creatureCode! } },
        }),
      );
      return rows[0] ?? null;
    },
  });
}

// ---------- biomes ----------
export function useBiomes() {
  return useQuery({
    queryKey: ["biomes", "list"],
    queryFn: async () => unwrap(await api.GET("/biomes", { params: { query: {} } })),
  });
}

/**
 * Quais biomas pertencem a cada mapa. É por aqui que a ficha descobre em que
 * chão a criatura pode ser posta para minerar — `creatures.biome_id` é
 * anotação de catálogo, não viaja no bundle e não serve para essa conta.
 */
export function useMapBiomes() {
  return useQuery({
    queryKey: ["map-biomes", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/map-biomes", { params: { query: { limit: 200, offset: 0 } } })),
  });
}

/**
 * Onde cada bioma fica DENTRO do mapa — a partição espacial que
 * `WorldRoot.DEFAULT_BIOME` ainda substitui no jogo.
 *
 * Não é a mesma pergunta que `map_biomes` responde. A junção diz quais
 * biomas o mapa tem e em que ordem a travessia os apresenta; a região diz que
 * chão cada um ocupa. Um bioma pode estar na travessia sem ter região nenhuma
 * — e a tela de mapas precisa dizer isso em voz alta, porque nesse estado ele
 * existe no catálogo e não existe no terreno.
 */
export function useMapBiomeRegions() {
  return useQuery({
    queryKey: ["map-biome-regions", "list"],
    queryFn: async () =>
      unwrap(
        await api.GET("/map-biome-regions", {
          params: { query: { limit: 500, offset: 0 } },
        }),
      ),
  });
}

/** Quem leva a quem, e a que preço. `requiredGlyphId` nulo = passagem livre. */
export function useMapConnections() {
  return useQuery({
    queryKey: ["map-connections", "list"],
    queryFn: async () =>
      unwrap(
        await api.GET("/map-connections", { params: { query: { limit: 200, offset: 0 } } }),
      ),
  });
}

export function useGlyphs() {
  return useQuery({
    queryKey: ["glyphs", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/glyphs", { params: { query: { limit: 100, offset: 0 } } })),
  });
}

/** A arena de cada mapa: oponente, nível e o Glifo que a vitória concede. */
export function useNpcDuelists() {
  return useQuery({
    queryKey: ["npc-duelists", "list"],
    queryFn: async () =>
      unwrap(
        await api.GET("/npc-duelists", { params: { query: { limit: 200, offset: 0 } } }),
      ),
  });
}

// ---------- items ----------
export function useItems(category?: "mineral" | "capture" | "heal" | "material") {
  return useQuery({
    queryKey: ["items", "list", category ?? null],
    queryFn: async () =>
      unwrap(
        await api.GET("/items", {
          params: { query: { limit: 500, offset: 0, category } },
        }),
      ),
  });
}

/**
 * A camada de números do item: preço e o par effectCode/effectValue que o
 * Godot executa. Tabela 1:1 endereçada pelo código do item, então a lista
 * inteira cabe numa chamada e o cruzamento acontece na tela.
 */
export function useItemStats() {
  return useQuery({
    queryKey: ["item-stats", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/item-stats", { params: { query: { limit: 500, offset: 0 } } })),
  });
}

// ---------- economy (singleton) ----------
export function useEconomyRules() {
  return useQuery({
    queryKey: ["economy-rules", "singleton"],
    queryFn: async () => unwrap(await api.GET("/economy-rules")),
  });
}

// ---------- npcs + merchant offers ----------
export function useNpcs() {
  return useQuery({
    queryKey: ["npcs", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/npcs", { params: { query: { limit: 500, offset: 0 } } })),
  });
}

export function useMerchantOffers() {
  return useQuery({
    queryKey: ["merchant-offers", "list"],
    queryFn: async () =>
      unwrap(
        await api.GET("/merchant-offers", { params: { query: { limit: 500, offset: 0 } } }),
      ),
  });
}

// ---------- creature numbers ----------

/**
 * A camada de números do elenco inteiro, não só a da criatura aberta.
 *
 * A ficha desenha barra, e barra sem escala mente: 55 de defesa é muito ou
 * pouco depende do resto do elenco. Puxar a lista toda numa chamada é o que
 * permite medir cada stat contra o teto do elenco em vez de contra um máximo
 * inventado em código. A tabela é 1:1 com `creatures` — cabe folgado.
 */
export function useCreatureStats() {
  return useQuery({
    queryKey: ["creature-stats", "list"],
    queryFn: async () =>
      unwrap(
        await api.GET("/creature-stats", { params: { query: { limit: 500, offset: 0 } } }),
      ),
  });
}

export function useCaptureRule(creatureCode: string | undefined) {
  return useQuery({
    queryKey: ["capture-rules", "by-creature", creatureCode],
    enabled: !!creatureCode,
    queryFn: async () => {
      const rows = unwrap(
        await api.GET("/capture-rules", {
          params: { query: { creatureCode: creatureCode! } },
        }),
      );
      return rows[0] ?? null;
    },
  });
}

export function useCreatureAbilityLinks(creatureCode: string | undefined) {
  return useQuery({
    queryKey: ["creature-abilities", "by-creature", creatureCode],
    enabled: !!creatureCode,
    queryFn: async () =>
      unwrap(
        await api.GET("/creature-abilities", {
          params: { query: { limit: 200, offset: 0, creatureCode: creatureCode! } },
        }),
      ),
  });
}

export function useDrops(creatureCode: string | undefined) {
  return useQuery({
    queryKey: ["drops", "by-creature", creatureCode],
    enabled: !!creatureCode,
    queryFn: async () =>
      unwrap(
        await api.GET("/drops", {
          params: { query: { limit: 200, offset: 0, creatureCode: creatureCode! } },
        }),
      ),
  });
}

// ---------- abilities ----------
export function useAbilities() {
  return useQuery({
    queryKey: ["abilities", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/abilities", { params: { query: { limit: 500, offset: 0 } } })),
  });
}

export function useAbilityStats() {
  return useQuery({
    queryKey: ["ability-stats", "list"],
    queryFn: async () =>
      unwrap(
        await api.GET("/ability-stats", { params: { query: { limit: 500, offset: 0 } } }),
      ),
  });
}

// ---------- relics ----------
export function useRelics() {
  return useQuery({
    queryKey: ["relics", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/relics", { params: { query: { limit: 200, offset: 0 } } })),
  });
}

export function useRelicStats() {
  return useQuery({
    queryKey: ["relic-stats", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/relic-stats", { params: { query: { limit: 200, offset: 0 } } })),
  });
}

export function useRelicRules() {
  return useQuery({
    queryKey: ["relic-rules", "singleton"],
    queryFn: async () => unwrap(await api.GET("/relic-rules")),
  });
}

// ---------- global tuning (singletons) ----------
/**
 * Amplificador e Encantador — o resto do set do domador (documento
 * `equipamentos`). Três consultas porque são três tabelas, e a tela mostra
 * as três juntas: modelo, números e receita.
 */
export function useEquipment() {
  return useQuery({
    queryKey: ["equipment", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/equipment", { params: { query: { limit: 200, offset: 0 } } })),
  });
}

export function useEquipmentStats() {
  return useQuery({
    queryKey: ["equipment-stats", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/equipment-stats", { params: { query: { limit: 200, offset: 0 } } })),
  });
}

export function useEquipmentRecipes() {
  return useQuery({
    queryKey: ["equipment-recipes", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/equipment-recipes", { params: { query: { limit: 500, offset: 0 } } })),
  });
}

export function useCombatRules() {
  return useQuery({
    queryKey: ["combat-rules", "singleton"],
    queryFn: async () => unwrap(await api.GET("/combat-rules")),
  });
}

export function useProgressionRules() {
  return useQuery({
    queryKey: ["progression-rules", "singleton"],
    queryFn: async () => unwrap(await api.GET("/progression-rules")),
  });
}

// ---------- elemental advantages ----------
export function useElementalAdvantages() {
  return useQuery({
    queryKey: ["elemental-advantages", "list"],
    queryFn: async () =>
      unwrap(
        await api.GET("/elemental-advantages", {
          params: { query: { limit: 200, offset: 0 } },
        }),
      ),
  });
}

// ---------- mining ----------
export function useMiningRates() {
  return useQuery({
    queryKey: ["mining-rates", "list"],
    queryFn: async () =>
      unwrap(await api.GET("/mining-rates", { params: { query: { limit: 500, offset: 0 } } })),
  });
}

// ---------- documents ----------
export function useDocuments() {
  return useQuery({
    queryKey: ["documents", "list"],
    queryFn: async () => unwrap(await api.GET("/documents", { params: { query: {} } })),
  });
}

export function useDocument(slug: string | undefined) {
  return useQuery({
    queryKey: ["documents", "detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      // The endpoint negotiates on Accept. Force JSON so we get metadata +
      // body together; `text/markdown` would return a plain string.
      const res = await api.GET("/documents/{slug}", {
        params: { path: { slug: slug! } },
        headers: { Accept: "application/json" },
      });
      const data = unwrap(res);
      if (typeof data === "string") throw new Error("Expected JSON envelope");
      return data;
    },
  });
}

// ---------- changelog ----------
export function useChangelog(limit = 100) {
  return useQuery({
    queryKey: ["changelog", "list", limit],
    queryFn: async () =>
      unwrap(await api.GET("/changelog", { params: { query: { limit, offset: 0 } } })),
  });
}

/**
 * Edição da paleta de um elemento.
 *
 * É a primeira escrita do frontend que altera CONTEÚDO do catálogo (as duas
 * anteriores mexem em `modelUrl`, que é ligação com asset). Não abre exceção
 * à regra do `DATA_WORKFLOW.md`: a API continua sendo a única via de escrita,
 * `reason`/`impact` continuam obrigatórios e o changelog registra igual. O que
 * muda é só quem monta o corpo da requisição — um formulário em vez de um
 * PowerShell. E a paleta é justamente o campo que pede isso: escolher seis
 * rampas de cor às cegas, sem ver o resultado ao lado, não é trabalho que
 * `Invoke-RestMethod` faça bem.
 */
export function useUpdateElementPalette() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      paletteShadow: string;
      paletteMid: string;
      paletteHighlight: string;
      paletteAura: string;
      paletteSpread: number;
      reason: string;
      impact: string;
    }) => {
      const { code, ...body } = input;
      return unwrap(
        await api.PATCH("/elements/{code}", {
          params: { path: { code } },
          headers: { "x-api-key": import.meta.env.VITE_API_KEY ?? "" },
          body,
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elements"] });
    },
  });
}
