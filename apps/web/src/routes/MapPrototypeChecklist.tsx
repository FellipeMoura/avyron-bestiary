import { Link } from "react-router-dom";

const checklist = [
  { label: "Composição isométrica do PZ-01", done: true, note: "A imagem protótipo mantém a leitura do mapa como mar aberto + recife central + borda rochosa." },
  { label: "Recife central como ponto de destaque visual", done: true, note: "O núcleo do mapa precisa ficar mais denso e mais exuberante que o restante." },
  { label: "Canal de água/corrente atravessando o relevo", done: true, note: "Esses traços marcam a orientação do mapa e quebram a simetria." },
  { label: "Borda rochosa / escarpa de profundidade", done: true, note: "A escarpa cria a leitura de diferença de altura e de zona em profundidade." },
  { label: "Remodelagem do relevo (heightmap, escarpas, rampas)", done: false, note: "Criar o relevo com penhascos, rampas de ilha/costa, taludes e taludes de canyon conforme o protótipo; ajustar masks/heightmap e geometrias de borda." },
  { label: "Regras de submersão, waterline e apoio no terreno", done: false, note: "Garantir que MapTerrain.submerged, water_line e a leitura 'nos pés' correspondam às rampas e à transição de profundidade — incluir clamp_to_bounds e correções de encenação." },
  { label: "Densidade por bioma e não uniforme", done: false, note: "Recife alto, mar profundo escasso, costa e glacial com intenção de vazio ou presença de rocha." },
  { label: "Biome props para Mar Profundo", done: false, note: "Necessário escuro, grande, pouco detalhado e mais vazio que coral." },
  { label: "Biome props para Plataforma Glacial", done: false, note: "Sem vegetação; rocha, gelo quebrado, morena e sedimento glacial." },
  { label: "Biome props para Costa Primordial", done: false, note: "Rocha molhada, lama, areias e poças de maré; sem madeira ou troncos." },
  { label: "Hero props do recife", done: false, note: "Peças de marco para dar presença visual em longa distância." },
  { label: "MapDressing por bioma e região", done: false, note: "A distribuição de props deve responder à região, não ao mapa inteiro." },
  { label: "Spawn e população por bioma", done: false, note: "A Plataforma Glacial precisa continuar sem fauna e sem padrão de densidade da região recifal." },
  { label: "Pipeline de asset e atlas compartilhado", done: false, note: "Usar .gltf com atlas por bioma, não .glb individual para todo o kit." },
  { label: "Otimização final de props e VRAM", done: false, note: "256²/512²/1024² conforme categoria do prop e densidade do mapa." },
] as const;

const existingMaterials = [
  "11 props aquáticos já disponíveis em models/biomes/aquatic/",
  "Kit de vegetação terrestre em models/biomes/megakit/ (útil para outros mapas, não para PZ-01)",
  "Matriz de leitura de biomas e regiões já documentada em BIOME_PROPS.md",
  "Base de map_biomes / região de mapa e padrões de densidade em código e docs",
  "Placeholder de criaturas e ambiente já em uso para a exploração",
  "PZ-01 já tem lógica de submersão, recifes e partição espacial mapeada",
] as const;

const missingMaterials = [
  "6 props de Plataforma Glacial: placa quebrada, bloco errático, morena, cascalho, canal de água, gelo à deriva",
  "5 props de Mar Profundo: afloramento escuro, sedimento, laje de escarpa, aglomerado raro, detrito afundado",
  "4 props de Costa Primordial: poça de maré, rocha molhada, lama/areia, estromatólito/algas",
  "4 props de Mar Raso: banco de areia, pedra isolada, tufo de alga, conchas/bioclastos",
  "2 hero props do recife: marco grande e estruturado, para distância e leitura de presença",
  "Atlas de textura por bioma, com material único e superfície única por lote",
  "Export de props em lote alinhado ao pipeline do Godot e com base plana e fechada",
  "MapDressing por bioma com rotação e densidade específicas por região",
  "Controles de spawn, fauna e iluminação por zona do mapa",
  "Heightmap / masks de relevo para PZ-01 (escarpas, rampas, canais) — arquivos para importar no Godot e origem para o terrain sculpt",
  "Conjunto de meshes de borda (cliff edges) e placas de penhasco para compor escarpas em close",
  "Meshes de rampas/ramps pré-esculpidas para ilha da arena e rampa da costa (para garantir transição de nadar → andar)",
  "Ajustes de shader / parametros para waterline, névoa por altitude e transições de ambient (profiles por bioma)",
] as const;

export function MapPrototypeChecklist() {
  const done = checklist.filter((item) => item.done).length;
  const pending = checklist.length - done;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-3 font-mono text-micro uppercase tracking-[0.2em] text-graphite">
          <span>PZ-01</span>
          <span>·</span>
          <span>checklist do protótipo</span>
        </div>
        <h1 className="font-display text-2xl text-bone md:text-3xl">
          Remodelagem do mapa com referência ao protótipo da imagem 1
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-bone/70">
          A referência consolidou a direção visual e a lógica de bioma: o mapa deve ler como mar aberto,
          recife central com presença, borda rochosa em profundidade e zonas de densidade diferenciada.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded border border-graphite/40 bg-slate/5 p-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-graphite/30 pb-3">
            <h2 className="font-mono text-micro uppercase tracking-[0.18em] text-bone/80">
              Checklist de escopo
            </h2>
            <div className="font-mono text-micro text-graphite">
              {done}/{checklist.length} concluídos
            </div>
          </div>

          <ul className="space-y-3">
            {checklist.map((item) => (
              <li
                key={item.label}
                className="rounded border border-graphite/30 bg-void/70 p-4"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={[
                      "mt-1 h-4 w-4 rounded-full border",
                      item.done ? "border-moss bg-moss" : "border-graphite bg-transparent",
                    ].join(" ")}
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-bone">{item.label}</span>
                      <span className="font-mono text-micro uppercase text-graphite">
                        {item.done ? "done" : "pending"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-bone/65">{item.note}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-6">
          <div className="rounded border border-graphite/40 bg-slate/5 p-5">
            <h2 className="font-mono text-micro uppercase tracking-[0.18em] text-bone/80">
              Status do protótipo
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded border border-graphite/30 bg-void/60 p-3">
                <div className="font-mono text-micro text-graphite">concluído</div>
                <div className="mt-1 font-display text-2xl text-bone">{done}</div>
              </div>
              <div className="rounded border border-graphite/30 bg-void/60 p-3">
                <div className="font-mono text-micro text-graphite">pendente</div>
                <div className="mt-1 font-display text-2xl text-bone">{pending}</div>
              </div>
            </div>
          </div>

          <div className="rounded border border-graphite/40 bg-slate/5 p-5">
            <h2 className="font-mono text-micro uppercase tracking-[0.18em] text-bone/80">
              O que já temos
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-bone/70">
              {existingMaterials.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-moss">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded border border-graphite/40 bg-slate/5 p-5">
            <h2 className="font-mono text-micro uppercase tracking-[0.18em] text-bone/80">
              O que falta para fechar o escopo
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-bone/70">
              {missingMaterials.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-ember">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="rounded border border-graphite/40 bg-slate/5 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-micro uppercase tracking-[0.18em] text-graphite">
              escopo de produção
            </p>
            <h2 className="mt-2 font-display text-xl text-bone">Objetos 3D de bioma e materiais necessários</h2>
          </div>
          <Link to="/maps" className="font-mono text-micro uppercase tracking-[0.18em] text-bone underline underline-offset-4">
            voltar para mapas
          </Link>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <div className="rounded border border-graphite/30 bg-void/60 p-4">
            <p className="font-mono text-micro uppercase tracking-[0.18em] text-graphite">base</p>
            <p className="mt-3 text-sm leading-6 text-bone/70">
              Layout do mapa, partição de biomas, densidade por zona, lógica de submersão, rotação e escala de props.
            </p>
          </div>
          <div className="rounded border border-graphite/30 bg-void/60 p-4">
            <p className="font-mono text-micro uppercase tracking-[0.18em] text-graphite">3d props</p>
            <p className="mt-3 text-sm leading-6 text-bone/70">
              Reefs hero, rochas vivas, sedimento escuro, gelo quebrado, lama costeira e atlas por bioma.
            </p>
          </div>
          <div className="rounded border border-graphite/30 bg-void/60 p-4">
            <p className="font-mono text-micro uppercase tracking-[0.18em] text-graphite">fechamento</p>
            <p className="mt-3 text-sm leading-6 text-bone/70">
              MapDressing, densidade por região, iluminação por zona e validação visual com o protótipo final.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
