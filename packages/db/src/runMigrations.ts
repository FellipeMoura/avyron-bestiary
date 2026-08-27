import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

/**
 * Aplica as migrations pendentes, **uma transação por arquivo**.
 *
 * O `migrate()` do Drizzle envolve todas as pendentes numa transação só. Isso
 * quebra banco novo: a `0008` faz `ALTER TYPE item_category ADD VALUE
 * 'material'` e a `0010` usa `'material'` num CHECK — o Postgres recusa usar
 * um valor de enum que ainda não foi commitado (`55P04, unsafe use of new
 * value`), e a transação inteira volta atrás. Numa máquina que migrou aos
 * poucos nunca doeu, porque cada migration commitou na sua vez; numa máquina
 * nova, onde as 16 rodam juntas, `pnpm db:restore` não passava da primeira.
 *
 * Mora aqui, e não em `migrate.ts`, porque `restore.ts` migra antes de
 * carregar o snapshot — e é justamente o restore que roda em máquina nova.
 * Duas cópias do mesmo laço davam exatamente um lugar para o conserto não
 * chegar.
 *
 * A escrituração é idêntica à do Drizzle de propósito — mesmo schema
 * `drizzle`, mesma tabela `__drizzle_migrations`, mesmas colunas, e o mesmo
 * portão por `created_at` (que é o `when` do `_journal.json`, não o hash: por
 * isso editar uma migration antiga **não** a faz rodar de novo). Um banco
 * migrado por aqui e um migrado pelo Drizzle ficam indistinguíveis — schema
 * conferido com `pg_dump` e escrituração conferida linha a linha.
 *
 * **Contrapartida:** com transação por arquivo, uma falha no meio deixa as
 * anteriores aplicadas em vez de desfazer tudo. É o comportamento normal de
 * migrador (Rails, Django, Flyway fazem assim) e o preço de conseguir commitar
 * entre um `ALTER TYPE` e o uso do valor novo. A mensagem de erro nomeia a
 * migration que parou, e rodar de novo retoma dali.
 *
 * Statement que não pode rodar dentro de transação (`CREATE INDEX
 * CONCURRENTLY`, por exemplo) continua sem lugar aqui — não existe nenhum
 * hoje, e se precisar de um, ele pede um caminho próprio.
 */

const MIGRATIONS_FOLDER = "./drizzle";

interface JournalEntry {
  when: number;
  tag: string;
}

/** Devolve quantas migrations foram aplicadas nesta rodada. */
export async function runMigrations(
  url: string,
  log: (message: string) => void = console.log,
): Promise<number> {
  // Só para a mensagem: o `readMigrationFiles` devolve sql/hash/millis, sem nome.
  const journal = JSON.parse(
    readFileSync(resolve(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  const tagByMillis = new Map(journal.entries.map((e) => [e.when, e.tag]));

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`,
    );

    // Fixado antes do laço, como o Drizzle faz: o portão é o timestamp da
    // última aplicada quando a rodada começou.
    const rows = await sql<{ created_at: string | null }[]>`
      select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1
    `;
    const lastMillis = rows[0]?.created_at != null ? Number(rows[0].created_at) : null;

    let applied = 0;
    for (const migration of migrations) {
      if (lastMillis !== null && lastMillis >= migration.folderMillis) continue;
      const tag = tagByMillis.get(migration.folderMillis) ?? String(migration.folderMillis);

      try {
        await sql.begin(async (tx) => {
          for (const statement of migration.sql) {
            await tx.unsafe(statement);
          }
          await tx`
            insert into drizzle.__drizzle_migrations ("hash", "created_at")
            values (${migration.hash}, ${migration.folderMillis})
          `;
        });
      } catch (error) {
        console.error(`falhou em ${tag} — as anteriores ficaram aplicadas`);
        throw error;
      }

      log(`  aplicada ${tag}`);
      applied++;
    }

    return applied;
  } finally {
    await sql.end();
  }
}
