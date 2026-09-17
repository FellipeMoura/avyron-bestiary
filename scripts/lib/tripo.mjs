import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

/**
 * Cliente mínimo da API do Tripo (`https://openapi.tripo3d.ai/v3`).
 *
 * A chave vem SÓ de `TRIPO_API_KEY` no ambiente — nunca de arquivo nem de
 * argumento, pela mesma regra do bestiário para segredo (ver CLAUDE.md,
 * "Modelo de ameaça"). Toda tarefa é assíncrona: cria, recebe `task_id`,
 * consulta `GET /tasks/{id}` até `success`/`failed`/`banned`/`cancelled`.
 * A URL de saída expira em 5 minutos, então `download` corre logo em
 * seguida no mesmo processo.
 *
 * Doc: `https://developers.tripo3d.ai/pt/docs/<pagina>.md` (a versão HTML é
 * SPA e vem vazia num fetch).
 */

const BASE = "https://openapi.tripo3d.ai/v3";

function key() {
  const k = process.env.TRIPO_API_KEY;
  if (!k) {
    console.error("TRIPO_API_KEY ausente no ambiente");
    process.exit(1);
  }
  return k;
}

async function call(method, path, body, isForm = false) {
  const headers = { Authorization: `Bearer ${key()}` };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0) {
    const msg = json.message ?? res.statusText;
    throw new Error(`${method} ${path} -> HTTP ${res.status} code ${json.code ?? "?"}: ${msg}${json.suggestion ? ` (${json.suggestion})` : ""}`);
  }
  return json.data;
}

export async function balance() {
  return call("GET", "/account/balance");
}

/** Sobe um arquivo local (imagem ≤ 20 MB, modelo ≤ 150 MB) e devolve o `file_token`. */
export async function upload(path) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(path)]), basename(path));
  const data = await call("POST", "/files", form, true);
  return data.file_token;
}

/** Cria uma tarefa em `path` (ex.: `/generation/multiview-to-model`) e devolve o `task_id`. */
export async function createTask(path, payload) {
  const data = await call("POST", path, payload);
  return data.task_id;
}

export async function getTask(taskId) {
  return call("GET", `/tasks/${taskId}`);
}

/** Espera a tarefa terminar, imprimindo progresso; devolve o objeto da tarefa. */
export async function waitTask(taskId, { intervalMs = 2500, timeoutMs = 10 * 60 * 1000, label = taskId } = {}) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const task = await getTask(taskId);
    const line = `${task.status} ${task.progress ?? 0}%`;
    if (line !== last) {
      console.log(`  [${label}] ${line}`);
      last = line;
    }
    if (task.status === "success") return task;
    if (["failed", "banned", "cancelled", "expired"].includes(task.status)) {
      throw new Error(`tarefa ${taskId} terminou em ${task.status}${task.error ? `: ${JSON.stringify(task.error)}` : ""}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`tarefa ${taskId} estourou ${timeoutMs / 1000}s`);
}

/** Baixa uma URL de saída (expira em 5 min) para `dest`. */
export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
