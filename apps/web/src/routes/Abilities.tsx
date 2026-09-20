import { Link, useSearchParams } from "react-router-dom";
import { CodeIcon } from "../components/CodeIcon";
import { Filter } from "../components/Filter";
import {
  useAbilities,
  useAbilityStats,
  useAllCreatureAbilityLinks,
  useCreatures,
  useElements,
} from "../hooks/useApi";
import {
  ABILITY_EFFECT_LABEL,
  ABILITY_ROLE_LABEL,
  ATTACK_VARIANT_LABEL,
  type AbilityEffect,
  type AbilityRole,
  type AttackVariant,
  formatNumber,
  plural,
} from "../lib/labels";

type Creature = NonNullable<ReturnType<typeof useCreatures>["data"]>[number];
type Ability = NonNullable<ReturnType<typeof useAbilities>["data"]>[number];
type AbilityStat = NonNullable<ReturnType<typeof useAbilityStats>["data"]>[number];

const ROLE_OPTIONS = [
  { value: "", label: "todos os papéis" },
  { value: "basico", label: ABILITY_ROLE_LABEL.basico },
  { value: "elemental", label: ABILITY_ROLE_LABEL.elemental },
  { value: "buff", label: ABILITY_ROLE_LABEL.buff },
  { value: "despertar", label: ABILITY_ROLE_LABEL.despertar },
  { value: "outro", label: ABILITY_ROLE_LABEL.outro },
] as const;

/** Mesma classificação do esquema de golpes do PZ-01 — ver o comentário de `AbilityRole`. */
function roleOf(ability: Ability, stat: AbilityStat | undefined): AbilityRole {
  if (ability.awakeningOnly) return "despertar";
  if (stat?.effectCode === "damage") return ability.elementId == null ? "basico" : "elemental";
  if (stat?.effectCode === "buff_attack" || stat?.effectCode === "buff_defense") return "buff";
  return "outro";
}

/**
 * Todas as habilidades, cada uma com a lista de criaturas (`CRT-XXX`) que a
 * conhecem — a inversão de `CreatureDetail.AbilitiesSection` (que vai de
 * criatura pra golpe). Existe pra apoiar a decisão de qual habilidade usa
 * qual `attackVariant` em combate: ver isso ao lado de quem já usa o golpe é
 * o que informa a escolha, não o contrário.
 *
 * Só leitura — sem tela de edição aqui, mesma regra do CLAUDE.md do
 * bestiário (só `/elements` escreve pela UI).
 */
export function Abilities() {
  const [params, setParams] = useSearchParams();
  const role = params.get("role") ?? "";
  const setRole = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("role", value);
    else next.delete("role");
    setParams(next, { replace: true });
  };

  const abilities = useAbilities();
  const abilityStats = useAbilityStats();
  const links = useAllCreatureAbilityLinks();
  const creatures = useCreatures();
  const elements = useElements();

  const loading =
    abilities.isLoading ||
    abilityStats.isLoading ||
    links.isLoading ||
    creatures.isLoading ||
    elements.isLoading;
  const error =
    abilities.error ?? abilityStats.error ?? links.error ?? creatures.error ?? elements.error;

  const statByAbility = new Map((abilityStats.data ?? []).map((s) => [s.abilityId, s]));
  const elementById = new Map((elements.data ?? []).map((e) => [e.id, e]));
  const creatureById = new Map((creatures.data ?? []).map((c) => [c.id, c]));

  const creaturesByAbility = new Map<number, Creature[]>();
  for (const link of links.data ?? []) {
    const creature = creatureById.get(link.creatureId);
    if (!creature) continue;
    const list = creaturesByAbility.get(link.abilityId) ?? [];
    list.push(creature);
    creaturesByAbility.set(link.abilityId, list);
  }

  const rows = [...(abilities.data ?? [])]
    .filter((a) => !role || roleOf(a, statByAbility.get(a.id)) === role)
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-micro tracking-widest text-graphite">HAB</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Habilidades</h1>
        <p className="mt-3 font-mono text-xs text-graphite">
          {rows.length ? `${rows.length} ${plural(rows.length, "habilidade")}` : "carregando"}
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-4 border-y border-graphite/40 py-4">
        <Filter label="papel" value={role} onChange={setRole} options={[...ROLE_OPTIONS]} />
      </section>

      {loading && <p className="font-mono text-xs text-graphite">carregando…</p>}
      {error && <p className="font-mono text-xs text-ember">erro: {String(error)}</p>}
      {!loading && rows.length === 0 && (
        <p className="font-mono text-xs text-graphite">nenhuma habilidade corresponde a este filtro.</p>
      )}

      <ul className="divide-y divide-graphite/30 border-y border-graphite/30">
        {rows.map((a) => {
          const stat = statByAbility.get(a.id);
          const element = a.elementId != null ? elementById.get(a.elementId) : null;
          const users = [...(creaturesByAbility.get(a.id) ?? [])].sort((x, y) =>
            x.code.localeCompare(y.code),
          );

          return (
            <li key={a.code} className="py-5">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-xs text-ember">{a.code}</span>
                <span className="font-display text-lg text-bone">{a.name}</span>
                <span className="font-mono text-micro uppercase tracking-widest text-graphite">
                  {ABILITY_ROLE_LABEL[roleOf(a, stat)]}
                </span>
                {element && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-bone/70">
                    <CodeIcon code={element.code} />
                    {element.name}
                  </span>
                )}
                {stat && (
                  <span className="ml-auto font-mono text-micro uppercase tracking-widest text-graphite">
                    {ATTACK_VARIANT_LABEL[stat.attackVariant as AttackVariant] ??
                      stat.attackVariant}
                  </span>
                )}
              </div>

              <p className="mt-1.5 font-sans text-xs text-bone/70">
                {stat ? (
                  <>
                    {ABILITY_EFFECT_LABEL[stat.effectCode as AbilityEffect] ?? stat.effectCode}
                    {stat.power > 0 && ` · poder ${stat.power}`}
                    {` · precisão ${stat.accuracy}%`}
                    {stat.effectValue !== 0 && ` · ${formatNumber(stat.effectValue)}`}
                    {stat.targetSelf && " · em si mesma"}
                  </>
                ) : (
                  <span className="text-bone/50">sem linha em ability_stats</span>
                )}
              </p>

              <p className="mt-3 font-mono text-micro uppercase tracking-widest text-graphite">
                {users.length} {plural(users.length, "criatura")}
              </p>
              {users.length === 0 ? (
                <p className="mt-1 font-mono text-xs text-bone/50">
                  nenhuma criatura conhece este golpe
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {users.map((c) => (
                    <Link
                      key={c.code}
                      to={`/bestiary/${c.code}`}
                      className="border border-graphite/40 px-2 py-1 font-mono text-micro text-bone/80 transition-colors hover:border-bone hover:text-bone"
                    >
                      {c.code}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
