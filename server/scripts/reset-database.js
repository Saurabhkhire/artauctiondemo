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
    }
  } catch (e) {
    console.error('Could not remove', p, e.message);
  }
}

removeIfExists(dbPath);
removeIfExists(dbPath + '-wal');
removeIfExists(dbPath + '-shm');

// Optional: clear uploaded images (keeps folder)
if (fs.existsSync(uploadsDir)) {
  for (const f of fs.readdirSync(uploadsDir)) {
    if (f === '.gitkeep') continue;
    removeIfExists(path.join(uploadsDir, f));
  }
}

console.log('Local auction data cleared. Restart the server to recreate an empty database.');
