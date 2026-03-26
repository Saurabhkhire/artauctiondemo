import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'auction.db');

function isPostgres() {
  return !!process.env.DATABASE_URL;
}

function ensureSqliteDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function qmarksToPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function sqliteInitSchema(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('artist','buyer','admin')),
      virtual_balance REAL NOT NULL DEFAULT 0,
      use_stripe_future INTEGER NOT NULL DEFAULT 0,
      stripe_placeholder TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS arts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','in_auction','sold')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','ended')),
      finalized INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auction_arts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
      art_id INTEGER NOT NULL REFERENCES arts(id),
      starting_bid REAL NOT NULL DEFAULT 0,
      max_bid_allowed REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auction_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      budget_cap REAL NOT NULL,
      UNIQUE(auction_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
      art_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS art_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL REFERENCES auctions(id),
      art_id INTEGER NOT NULL REFERENCES arts(id),
      buyer_id INTEGER NOT NULL REFERENCES users(id),
      final_price REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(art_id)
    );

    CREATE INDEX IF NOT EXISTS idx_bids_lot ON bids(auction_id, art_id);
    CREATE INDEX IF NOT EXISTS idx_arts_artist ON arts(artist_id);
    CREATE INDEX IF NOT EXISTS idx_auctions_times ON auctions(start_at, end_at);
  `);
}

async function pgInitSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('artist','buyer','admin')),
        virtual_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
        use_stripe_future INTEGER NOT NULL DEFAULT 0,
        stripe_placeholder TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS arts (
        id BIGSERIAL PRIMARY KEY,
        artist_id BIGINT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','in_auction','sold')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auctions (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','ended')),
        finalized INTEGER NOT NULL DEFAULT 0,
        created_by BIGINT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auction_arts (
        id BIGSERIAL PRIMARY KEY,
        auction_id BIGINT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        art_id BIGINT NOT NULL REFERENCES arts(id),
        starting_bid DOUBLE PRECISION NOT NULL DEFAULT 0,
        max_bid_allowed DOUBLE PRECISION NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auction_registrations (
        id BIGSERIAL PRIMARY KEY,
        auction_id BIGINT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id),
        budget_cap DOUBLE PRECISION NOT NULL,
        UNIQUE(auction_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS bids (
        id BIGSERIAL PRIMARY KEY,
        auction_id BIGINT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        art_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL REFERENCES users(id),
        amount DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS art_sales (
        id BIGSERIAL PRIMARY KEY,
        auction_id BIGINT NOT NULL REFERENCES auctions(id),
        art_id BIGINT NOT NULL UNIQUE REFERENCES arts(id),
        buyer_id BIGINT NOT NULL REFERENCES users(id),
        final_price DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_bids_lot ON bids(auction_id, art_id);
      CREATE INDEX IF NOT EXISTS idx_arts_artist ON arts(artist_id);
      CREATE INDEX IF NOT EXISTS idx_auctions_times ON auctions(start_at, end_at);
    `);
  } finally {
    client.release();
  }
}

/** Serialize all use of one better-sqlite3 connection. Awaiting inside a transaction yields the event loop; without this, other requests could BEGIN while a transaction is already open. */
function createSqliteSerialQueue() {
  let chain = Promise.resolve();
  return function enqueue(task) {
    const p = chain.then(
      () => task(),
      () => task()
    );
    chain = p.then(
      () => {},
      () => {}
    );
    return p;
  };
}

function makeSqliteAdapter(sqlite) {
  const enqueue = createSqliteSerialQueue();
  // Passed to transaction(fn) — runs on the same connection but must NOT go through enqueue
  // (would deadlock: outer transaction holds the queue until fn completes).
  const direct = {
    dialect: 'sqlite',
    async get(sql, params = []) {
      return sqlite.prepare(sql).get(...params) ?? null;
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      const r = sqlite.prepare(sql).run(...params);
      return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
    },
  };

  const adapter = {
    dialect: 'sqlite',
    async get(sql, params = []) {
      return enqueue(() => direct.get(sql, params));
    },
    async all(sql, params = []) {
      return enqueue(() => direct.all(sql, params));
    },
    async run(sql, params = []) {
      return enqueue(() => direct.run(sql, params));
    },
    async transaction(fn) {
      return enqueue(async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const out = await fn(direct);
          sqlite.exec('COMMIT');
          return out;
        } catch (e) {
          try {
            sqlite.exec('ROLLBACK');
          } catch {
            /* ignore rollback errors */
          }
          throw e;
        }
      });
    },
  };
  return adapter;
}

function makePgAdapter(pool, client = null) {
  const q = async (sql, params = []) => {
    const psql = qmarksToPg(sql);
    const runner = client ?? pool;
    // If caller needs RETURNING, include it in the SQL passed in.
    return runner.query(psql, params);
  };
  return {
    dialect: 'postgres',
    async get(sql, params = []) {
      const r = await q(sql, params);
      return r.rows[0] ?? null;
    },
    async all(sql, params = []) {
      const r = await q(sql, params);
      return r.rows;
    },
    async run(sql, params = []) {
      // Make INSERT behave like sqlite's lastInsertRowid where possible by auto-appending RETURNING id.
      const wantsReturning = /\breturning\b/i.test(sql);
      let r;
      if (!wantsReturning && /^\s*insert\s+/i.test(sql)) {
        r = await q(sql + ' RETURNING id', params);
      } else {
        r = await q(sql, params);
      }
      return { rowCount: r.rowCount, rows: r.rows };
    },
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const tx = makePgAdapter(pool, c);
        const out = await fn(tx);
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export let db = null;

export async function initDb() {
  if (db) return db;
  if (isPostgres()) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
    await pgInitSchema(pool);
    db = makePgAdapter(pool);
    return db;
  }
  ensureSqliteDir();
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqliteInitSchema(sqlite);
  db = makeSqliteAdapter(sqlite);
  return db;
}
