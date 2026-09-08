/**
 * Root motion: detectar e remover o deslocamento horizontal do osso raiz de
 * cada clipe de um documento glTF.
 *
 * **Todo clipe do jogo é in-place, sem exceção.** Quem move um corpo é sempre
 * o código — `CharacterBody3D` no jogador, a posição do ator nas criaturas —,
 * e um clipe que também anda faz o corpo viajar DUAS vezes: a malha escapa da
 * cápsula de colisão durante o ciclo e volta de um salto quando ele reinicia.
 * O sintoma no jogo é "nada mais rápido e depois reseta pra posição certa".
 * As bibliotecas UAL já chegam assim (o comentário de `_build_library` no
 * `character_rig.gd` chama isso de "a versão sem root motion"); o Meshy, não —
 * o `Swim_Forward` do corpo do jogador nadava 2,21 m pra frente em 4,57 s, e
 * nos corpos de criatura `Swim`, `Attack2` (a voadora) e `Death` (a queda)
 * andam de 1,0 a 1,7 m por ciclo.
 *
 * Vive num módulo próprio porque três caminhos precisam dele: a conversão de
 * um export novo (`convert-meshy.mjs`), o transplante de clipes entre corpos
 * (`transfer-clips.mjs`, que herda o defeito do doador) e a correção in-place
 * de um `.glb` já convertido antes de a remoção existir
 * (`strip-root-motion.mjs`). Uma cópia por script já divergiu uma vez — os
 * corpos de criatura convertidos em 2026-09-06 ficaram sem a correção que o
 * do jogador ganhou no dia seguinte.
 */

/**
 * O osso raiz da malha: o joint do skin que não é filho de outro joint.
 * `null` quando o documento não tem skin (corpo estático) — nada a fazer.
 */
export function rootJoint(doc) {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) return null;
  const joints = skin.listJoints();
  const isChild = new Set();
  for (const joint of joints) {
    for (const child of joint.listChildren()) isChild.add(child);
  }
  return joints.find((j) => !isChild.has(j)) ?? null;
}

/**
 * Tira o deslocamento HORIZONTAL líquido do osso raiz de cada clipe.
 *
 * Subtrai uma RAMPA LINEAR, não o valor do primeiro quadro: zerar X/Z de vez
 * mataria a ondulação lateral da braçada junto com a viagem. Tirando só a
 * reta que liga o primeiro quadro ao último sobra a oscilação em torno dela —
 * e o ciclo fecha, que é o que um clipe marcado como loop precisa. Y fica
 * intacto: a subida e descida do corpo é gesto, não viagem.
 *
 * Viagem ou oscilação? O corte é RELATIVO à própria excursão horizontal do
 * clipe, não um número em unidades de modelo: o Meshy exporta em centímetros
 * e a UAL em metros, e um limiar absoluto que servisse a um seria cego ou
 * histérico no outro. Um ciclo in-place volta pra perto de onde saiu (deriva
 * perto de zero contra uma excursão inteira); um que viaja acaba na ponta da
 * própria excursão.
 *
 * CUBICSPLINE sai avisando em vez de ser tratado — o `output` ali guarda três
 * valores por quadro (tangente de entrada, valor, tangente de saída) e mexer
 * nele como se fosse um só produziria uma curva errada em silêncio. Nunca
 * visto num export do Meshy; se aparecer, o aviso é o pedido pra escrever o
 * caso.
 *
 * `animations` restringe a quais clipes olhar (default: todos). Devolve a
 * lista de descrições dos clipes corrigidos.
 */
export function stripRootMotion(doc, animations = doc.getRoot().listAnimations()) {
  const root = rootJoint(doc);
  if (!root) return [];

  const stripped = [];
  for (const anim of animations) {
    for (const channel of anim.listChannels()) {
      if (channel.getTargetNode() !== root || channel.getTargetPath() !== "translation") continue;

      const sampler = channel.getSampler();
      if (sampler.getInterpolation() === "CUBICSPLINE") {
        console.log(`  ${anim.getName().padEnd(40)} AVISO  root motion em CUBICSPLINE, nao tratado`);
        continue;
      }

      const out = sampler.getOutput();
      const values = out.getArray().slice();
      const times = sampler.getInput().getArray();
      const last = values.length / 3 - 1;
      if (last < 1) continue;

      const driftX = values[last * 3] - values[0];
      const driftZ = values[last * 3 + 2] - values[2];

      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (let i = 0; i <= last; i += 1) {
        minX = Math.min(minX, values[i * 3]);
        maxX = Math.max(maxX, values[i * 3]);
        minZ = Math.min(minZ, values[i * 3 + 2]);
        maxZ = Math.max(maxZ, values[i * 3 + 2]);
      }
      const excursion = Math.hypot(maxX - minX, maxZ - minZ);
      const drift = Math.hypot(driftX, driftZ);
      if (excursion === 0 || drift / excursion < 0.25) continue;

      const span = times[times.length - 1] - times[0];
      for (let i = 0; i <= last; i += 1) {
        const ratio = span === 0 ? 0 : (times[i] - times[0]) / span;
        values[i * 3] -= driftX * ratio;
        values[i * 3 + 2] -= driftZ * ratio;
      }
      // Accessor próprio antes de escrever: um `output` compartilhado por dois
      // clipes veria a correção do primeiro aplicada ao segundo.
      channel.getSampler().setOutput(out.clone().setArray(values));
      stripped.push(`${anim.getName()} (${drift.toFixed(2)}u de ${excursion.toFixed(2)}u de excursao)`);
    }
  }
  return stripped;
}
