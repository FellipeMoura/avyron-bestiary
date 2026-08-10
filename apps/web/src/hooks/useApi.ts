import { useQuery } from "@tanstack/react-query";
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

// ---------- items ----------
export function useItems(category?: "mineral" | "capture" | "heal") {
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
