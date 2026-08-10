import "./loadEnv";
import postgres from "postgres";

/**
 * Creates the database if it doesn't exist. Connects to the maintenance
 * database `postgres` and runs `CREATE DATABASE`. Useful because Windows
 * setups often don't have `psql` on PATH.
 *
 * Waits for the server to accept connections (code 57P03 during boot,
 * ECONNREFUSED if the container isn't listening yet).
 */
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (set it in the root .env file)");
}

const url = new URL(process.env.DATABASE_URL);
const targetDb = url.pathname.replace(/^\//, "");
if (!targetDb) throw new Error("DATABASE_URL must include a database name");

const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = "/postgres";

const MAX_ATTEMPTS = 30;
const DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTransient(err: any): boolean {
  return (
    err?.code === "57P03" || // starting up
    err?.code === "ECONNREFUSED" ||
    err?.code === "ETIMEDOUT" ||
    err?.errno === -4078
  );
}

async function connectWithRetry(): Promise<postgres.Sql> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const sql = postgres(adminUrl.toString(), { max: 1, connect_timeout: 5 });
    try {
      await sql`SELECT 1`;
      return sql;
    } catch (err) {
      await sql.end({ timeout: 1 }).catch(() => {});
      if (!isTransient(err) || attempt === MAX_ATTEMPTS) throw err;
      if (attempt === 1) console.log("waiting for postgres to accept connections...");
      await sleep(DELAY_MS);
    }
  }
  throw new Error("unreachable");
}

const sql = await connectWithRetry();

try {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${targetDb}) AS exists
  `;
  if (rows[0]?.exists) {
    console.log(`database "${targetDb}" already exists`);
  } else {
    // CREATE DATABASE can't be parameterized, and the name comes from a
    // trusted env var we already validated as a URL path component.
    await sql.unsafe(`CREATE DATABASE "${targetDb.replace(/"/g, '""')}"`);
    console.log(`created database "${targetDb}"`);
  }
} finally {
  await sql.end();
}
