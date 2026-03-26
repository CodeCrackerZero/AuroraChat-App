/**
 * SQLite Datenbank für lokales Caching
 *
 * Fixes:
 * - db-Variable Guard: Zugriff vor initDatabase() wirft klaren Fehler
 * - saveInvites: `inv.from` → `inv.from_name` fallback (API-Feld heißt "from")
 * - withTransactionAsync korrekt verwendet
 */
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export async function initDatabase(): Promise<void> {
  if (db) return; // bereits initialisiert
  db = await SQLite.openDatabaseAsync('chat.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS rooms (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT '',
      topic       TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL DEFAULT 'dm',
      member_count INTEGER NOT NULL DEFAULT 0,
      last_msg    TEXT NOT NULL DEFAULT '',
      last_time   TEXT NOT NULL DEFAULT '',
      last_ts     INTEGER NOT NULL DEFAULT 0,
      avatar_text TEXT NOT NULL DEFAULT '??',
      avatar_color TEXT NOT NULL DEFAULT '#3498db',
      avatar_url  TEXT,
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      room_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      username    TEXT NOT NULL DEFAULT '',
      text        TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL DEFAULT 'text',
      time        TEXT NOT NULL,
      initials    TEXT NOT NULL DEFAULT '??',
      color       TEXT NOT NULL DEFAULT '#3498db',
      is_self     INTEGER NOT NULL DEFAULT 0,
      avatar_url  TEXT,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_data (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      room_id   TEXT PRIMARY KEY,
      room_name TEXT NOT NULL DEFAULT '',
      type      TEXT NOT NULL DEFAULT 'dm',
      from_name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id, time);
  `);
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export async function saveRooms(rooms: any[]): Promise<void> {
  const d = getDb();
  await d.withTransactionAsync(async () => {
    for (const r of rooms) {
      await d.runAsync(
        `INSERT OR REPLACE INTO rooms
         (id, name, topic, type, member_count, last_msg, last_time, last_ts,
          avatar_text, avatar_color, avatar_url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
        [
          r.id,
          r.name ?? '',
          r.topic ?? '',
          r.type ?? 'dm',
          r.member_count ?? 0,
          r.last_msg ?? '',
          r.last_time ?? '',
          r.last_ts ?? 0,
          r.avatar_text ?? '??',
          r.avatar_color ?? '#3498db',
          r.avatar_url ?? null,
        ],
      );
    }
  });
}

export async function getRooms(): Promise<any[]> {
  return getDb().getAllAsync('SELECT * FROM rooms ORDER BY last_ts DESC');
}

export async function getRoom(id: string): Promise<any | null> {
  return getDb().getFirstAsync('SELECT * FROM rooms WHERE id = ?', [id]);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function saveMessages(roomId: string, messages: any[]): Promise<void> {
  const d = getDb();
  await d.withTransactionAsync(async () => {
    for (const m of messages) {
      await d.runAsync(
        `INSERT OR REPLACE INTO messages
         (id, room_id, user_id, username, text, type, time, initials, color, is_self, avatar_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id,
          roomId,
          m.user_id,
          m.username ?? '',
          m.text ?? '',
          m.type ?? 'text',
          m.time,
          m.initials ?? '??',
          m.color ?? '#3498db',
          m.is_self ? 1 : 0,
          m.avatar_url ?? null,
        ],
      );
    }
  });
}

export async function getMessages(roomId: string): Promise<any[]> {
  return getDb().getAllAsync(
    'SELECT * FROM messages WHERE room_id = ? ORDER BY time ASC',
    [roomId],
  );
}

export async function deleteMessageLocal(messageId: string): Promise<void> {
  await getDb().runAsync('DELETE FROM messages WHERE id = ?', [messageId]);
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function saveSessionData(key: string, value: string): Promise<void> {
  await getDb().runAsync(
    'INSERT OR REPLACE INTO session_data (key, value) VALUES (?, ?)',
    [key, value],
  );
}

export async function getSessionData(key: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM session_data WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function clearSessionData(): Promise<void> {
  const d = getDb();
  await d.runAsync('DELETE FROM session_data');
  await d.runAsync('DELETE FROM rooms');
  await d.runAsync('DELETE FROM messages');
  await d.runAsync('DELETE FROM invites');
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export async function saveInvites(invites: any[]): Promise<void> {
  const d = getDb();
  await d.runAsync('DELETE FROM invites');
  for (const inv of invites) {
    await d.runAsync(
      'INSERT OR REPLACE INTO invites (room_id, room_name, type, from_name) VALUES (?, ?, ?, ?)',
      [
        inv.room_id,
        inv.room_name ?? '',
        inv.type ?? 'dm',
        inv.from ?? inv.from_name ?? '',   // API liefert "from", DB-Spalte heißt from_name
      ],
    );
  }
}

export async function getInvites(): Promise<any[]> {
  return getDb().getAllAsync('SELECT * FROM invites ORDER BY created_at DESC');
}
