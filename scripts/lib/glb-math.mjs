/**
 * Álgebra 4×4 coluna-maior (a convenção do glTF) e utilitários de esqueleto
 * divididos pelos scripts do fluxo base + casca (`build-master.mjs`,
 * `medir-rig.mjs`). O `convert-tripo.mjs` tem cópias próprias mais antigas das
 * mesmas funções; ficam lá para o conversor continuar sendo um arquivo só.
 */

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export function trs(t, q, s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    t[0], t[1], t[2], 1,
  ];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  return m;
}

/** Inversa geral 4×4 por Gauss-Jordan. */
export function invert(m) {
  const a = [];
  for (let r = 0; r < 4; r++) { a.push([]); for (let c = 0; c < 4; c++) a[r].push(m[c * 4 + r]); for (let c = 0; c < 4; c++) a[r].push(r === c ? 1 : 0); }
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    if (Math.abs(d) < 1e-12) throw new Error("matriz singular");
    for (let k = 0; k < 8; k++) a[c][k] /= d;
    for (let r = 0; r < 4; r++) { if (r === c) continue; const f = a[r][c]; for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k]; }
  }
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = a[r][c + 4];
  return o;
}

export function applyPoint(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

/** Aplica só a parte 3×3 (sem translação). */
export function applyVector(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
}

/** Matriz de mundo de um nó do gltf-transform, subindo pelos pais. */
export function worldMatrix(node) {
  const p = node.getParentNode();
  return p ? mul(worldMatrix(p), node.getMatrix()) : node.getMatrix();
}

export function percentile(arr, q) {
  const s = [...arr].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : NaN;
}

/** Solda por posição (tolerância 0,1 mm): devolve `canon[i]` = índice do
 * representante de cada vértice. A malha do Tripo duplica vértice em costura,
 * e toda conta sobre TOPOLOGIA (difusão de peso, componente conexo, aresta)
 * precisa enxergar a superfície fechada. */
export function weldByPosition(points) {
  const canon = new Int32Array(points.length);
  const byPos = new Map();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
    if (byPos.has(key)) canon[i] = byPos.get(key); else { byPos.set(key, i); canon[i] = i; }
  }
  return canon;
}
