import "./loadEnv";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { LATEST_VERSION_SQL, TABLES } from "./tables";

/**
 * Carrega `packages/db/snapshot/` num banco local.
 *
 *   pnpm db:restore
 *
 * Máquina nova é: subir o Postgres, `pnpm db:create`, `pnpm db:restore`. Sem
 * rede — o snapshot vem no clone.
 *
 * **Destrutivo por desenho:** trunca tudo antes de carregar, para o resultado
 * ser o snapshot e não uma mistura dele com o que havia. Recusa rodar contra
 * um banco que não seja o da `DATABASE_URL` local, e como não existe mais
 * banco remoto configurado, não há o que confundir.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definido — confira o .env");

const SNAPSHOT_DIR = resolve(process.cwd(), "snapshot");
if (!existsSync(join(SNAPSHOT_DIR, "manifest.json"))) {
  throw new Error(`snapshot não encontrado em ${SNAPSHOT_DIR} — rode \`pnpm db:dump\` primeiro`);
}

const sql = postgres(url, { max: 2, connect_timeout: 5 });

try {
  // O snapshot é só dado; o schema vem das migrations, que são a única fonte
  // de verdade dele. Migrar antes evita carregar dado numa tabela cujo
  // formato mudou depois do dump.
  console.log("aplicando migrations...");
  const migrationClient = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  await migrationClient.end();

  console.log(`truncando ${TABLES.length} tabelas...`);
  await sql.unsafe(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

  const missing: string[] = [];

  for (const table of TABLES) {
    const path = join(SNAPSHOT_DIR, `${table}.jsonl`);
    if (!existsSync(path)) {
      // Não é fatal, mas é alto: significa que o snapshot foi tirado antes
      // desta tabela existir, e alguém vai descobrir isso do jeito ruim.
      missing.push(table);
      console.warn(`  ${table.padEnd(24)} SEM ARQUIVO no snapshot`);
      continue;
    }

    const rows = readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    if (rows.length === 0) {
      console.log(`  ${table.padEnd(24)} 0 linhas`);
      continue;
    }

    const columns = Object.keys(rows[0]!);
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await sql`INSERT INTO ${sql(table)} ${sql(chunk as never, columns)}`;
    }

    // A sequência tem de acompanhar o maior id carregado, senão o primeiro
    // INSERT pela API colide com uma linha existente.
    if (columns.includes("id")) {
      await sql.unsafe(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                       COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
      );
    }
    console.log(`  ${table.padEnd(24)} ${rows.length} linhas`);
  }

  const versionRows = await sql.unsafe<{ version: string }[]>(LATEST_VERSION_SQL);
  console.log(`restore completo — versao ${versionRows[0]?.version ?? "(vazio)"}`);
  if (missing.length > 0) {
    console.warn(`ATENCAO: ${missing.length} tabela(s) sem arquivo: ${missing.join(", ")}`);
  }
} finally {
  await sql.end();
}
