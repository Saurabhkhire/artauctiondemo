/**
 * Deletes the local SQLite database file (and WAL/SHM if present).
 * Run from server folder: npm run reset-db
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL is set. Refusing to reset a remote database from this script.');
  console.error('Unset DATABASE_URL to reset local SQLite, or reset Postgres via your host dashboard.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'auction.db');
const uploadsDir = path.join(__dirname, '..', 'uploads');

function removeIfExists(p) {
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log('Removed:', p);
      return true;
    }
  } catch (e) {
    console.error('Could not remove', p, e.message);
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      console.error('  → Stop the API server first (the terminal running "npm run dev" / "node src/index.js"), then run this script again.');
    }
    return false;
  }
  return true;
}

removeIfExists(dbPath);
removeIfExists(dbPath + '-wal');
removeIfExists(dbPath + '-shm');
const anyDbLeft =
  fs.existsSync(dbPath) || fs.existsSync(dbPath + '-wal') || fs.existsSync(dbPath + '-shm');

// Optional: clear uploaded images (keeps folder)
if (fs.existsSync(uploadsDir)) {
  for (const f of fs.readdirSync(uploadsDir)) {
    if (f === '.gitkeep') continue;
    removeIfExists(path.join(uploadsDir, f));
  }
}

if (!anyDbLeft) {
  console.log('Local auction data cleared. Start the server again to recreate an empty database.');
} else {
  console.error('\nDatabase files are still present. After stopping the server, run: node scripts\\reset-database.js');
  process.exitCode = 1;
}
