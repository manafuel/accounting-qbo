import Database from 'better-sqlite3';

/**
 * SQLite DB for token storage using better-sqlite3.
 * Schema: tokens(userId TEXT PRIMARY KEY, realmId TEXT, access TEXT, refresh TEXT, expires INTEGER, createdAt TEXT, updatedAt TEXT)
 */

const db = new Database('tokens.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS tokens (
  userId TEXT PRIMARY KEY,
  realmId TEXT,
  access TEXT,
  refresh TEXT,
  expires INTEGER,
  createdAt TEXT,
  updatedAt TEXT
);
`);

/**
 * @typedef {Object} TokensRow
 * @property {string} userId
 * @property {string} realmId
 * @property {string} access
 * @property {string} refresh
 * @property {number} expires  // epoch seconds
 * @property {string} createdAt
 * @property {string} updatedAt
 */

const upsertStmt = db.prepare(
  `INSERT INTO tokens (userId, realmId, access, refresh, expires, createdAt, updatedAt)
   VALUES (@userId, @realmId, @access, @refresh, @expires, @createdAt, @updatedAt)
   ON CONFLICT(userId) DO UPDATE SET
     realmId=excluded.realmId,
     access=excluded.access,
     refresh=excluded.refresh,
     expires=excluded.expires,
     updatedAt=excluded.updatedAt`
);

const selectStmt = db.prepare('SELECT * FROM tokens WHERE userId = ?');
const updateStmt = db.prepare(
  `UPDATE tokens SET realmId=@realmId, access=@access, refresh=@refresh, expires=@expires, updatedAt=@updatedAt
   WHERE userId=@userId`
);
const deleteStmt = db.prepare('DELETE FROM tokens WHERE userId = ?');

/**
 * Save new tokens for a user.
 * @param {TokensRow} row
 */
export function saveTokens(row) {
  const nowIso = new Date().toISOString();
  upsertStmt.run({ ...row, createdAt: nowIso, updatedAt: nowIso });
}

/**
 * Retrieve tokens by userId.
 * @param {string} userId
 * @returns {TokensRow | undefined}
 */
export function getTokens(userId) {
  return selectStmt.get(userId);
}

/**
 * Update existing tokens for a user.
 * @param {TokensRow} row
 */
export function updateTokens(row) {
  updateStmt.run({ ...row, updatedAt: new Date().toISOString() });
}

/**
 * Delete tokens for a user.
 * @param {string} userId
 */
export function deleteTokens(userId) {
  deleteStmt.run(userId);
}
