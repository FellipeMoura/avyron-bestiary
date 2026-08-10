import "./loadEnv";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { LATEST_VERSION_SQL, TABLES } from "./tables";

/**
 * Grava o conteúdo do banco em `packages/db/snapshot/`, para o repositório
 * ser a cópia durável do catálogo.
 *
 *   pnpm db:dump
 *
 * ## Por que isto existe
 *
 * Enquanto o bestiário rodava em produção, o VPS era — sem ninguém ter
 * decidido isso — a única cópia do conteúdo que não estava no laptop. Com
 * prod aposentado, essa cópia passaria a ser um volume Docker, e meses de
 * catálogo curado dependeriam de ninguém rodar `docker rm -v` distraído.
 *
 * ## Por que isto não viola a regra do seed congelado
 *
 * A regra existe porque conteúdo escrito como TypeScript em `seed/` não gera
 * changelog nem versão — ele entra no banco por fora da API e por fora do
 * registro. Um dump é o **resultado** de escritas que já passaram pela API e
 * já geraram changelog; a própria tabela `changelog` está dentro dele. A
 * escrita continua sendo só via API. Isto é onde o resultado descansa.
 *
 * ## Formato
 *
 * JSONL, uma tabela por arquivo, uma linha por registro, ordenado por `id`.
 * Assim uma alteração de conteúdo aparece como uma linha alterada no diff —
 * a mesma propriedade que o `bestiary.json` do jogo já tem, e a razão de não
 * usar `pg_dump`: um COPY binário seria menor e ilegível numa revisão.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definido — confira o .env");

const OUT_DIR = resolve(process.cwd(), "snapshot");

const sql = postgres(url, { max: 2, connect_timeout: 5 });

try {
  const versionRows = await sql.unsafe<{ version: string }[]>(LATEST_VERSION_SQL);
  const version = versionRows[0]?.version ?? null;

  mkdirSync(OUT_DIR, { recursive: true });

  // Limpa .jsonl órfãos: uma tabela removida do schema tem de sumir do
  // snapshot também, senão o restore de amanhã tenta inserir numa tabela que
  // não existe mais.
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith(".jsonl")) rmSync(join(OUT_DIR, file));
  }

  console.log(`versao: ${version ?? "(vazio)"}`);
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    const rows = await sql.unsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${table} ORDER BY id`,
    );
    counts[table] = rows.length;

    // Arquivo sempre escrito, mesmo vazio: a ausência do arquivo e a tabela
    // vazia são estados diferentes, e o restore precisa distinguir "não tem
    // dado" de "esqueci de exportar".
    const body = rows.map((r) => JSON.stringify(r)).join("\n");
    writeFileSync(join(OUT_DIR, `${table}.jsonl`), rows.length ? `${body}\n` : "", "utf8");
    console.log(`  ${table.padEnd(24)} ${rows.length} linhas`);
  }

  // Sem timestamp de propósito: um `generatedAt` faria todo dump produzir um
  // diff mesmo sem nada ter mudado, e o valor deste arquivo é justamente
  // dizer "mudou alguma coisa?" de relance.
  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    `${JSON.stringify({ version, tables: counts }, null, 2)}\n`,
    "utf8",
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`snapshot gravado em ${OUT_DIR} (${total} linhas)`);
} finally {
  await sql.end();
}
