import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH ?? "./abyss.db";

console.log("DB_PATH", DB_PATH);
export const db = new Database(DB_PATH);

// Create users table
db.run(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY
  )`
);

// Create tracked_tokens table (supports multiple alerts per user per token)
db.run(
  `CREATE TABLE IF NOT EXISTS tracked_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
);

// Create indexes for query performance
db.run(
  "CREATE INDEX IF NOT EXISTS idx_tracked_tokens_user_token ON tracked_tokens(user_id, token)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_tracked_tokens_token ON tracked_tokens(token)"
);

// Store user/bot conversations
db.run(
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
);

db.run(
  "CREATE INDEX IF NOT EXISTS idx_conversations_user_time ON conversations(user_id, created_at)"
);

export function createUser(userId: number) {
  return db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);
}

export function getUser(userId: number) {
  return db.query("SELECT id FROM users WHERE id = ?").get(userId) as { id: number } | undefined;
}

export function trackToken(params: TrackTokenInput) {
  const { userId, token, amount } = params;
  // Store in base units for accurate comparison (e.g., 3000 USDC -> 3000000000)
  const decimals = token === "USDC" || token === "DEEP" ? 6 : 9;
  const amountBase = Math.floor(amount * 10 ** decimals);
  return db.run(
    `INSERT INTO tracked_tokens (user_id, token, amount)
     VALUES (?, ?, ?)`,
    [userId, token, amountBase]
  );
}

export function untrackToken(params: UntrackTokenInput) {
  const { userId, token } = params;
  return db.run("DELETE FROM tracked_tokens WHERE user_id = ? AND token = ?", [userId, token]);
}

export function untrackSpecificAmount(params: { userId: number; token: TokenType; amount: number }) {
  const { userId, token, amount } = params;
  return db.run(
    "DELETE FROM tracked_tokens WHERE user_id = ? AND token = ? AND amount = ?",
    [userId, token, amount]
  );
}

export function getUserAlerts(userId: number) {
  return db.query(
    "SELECT token, amount FROM tracked_tokens WHERE user_id = ? ORDER BY token, amount"
  ).all(userId) as Array<{ token: TokenType; amount: number }>;
}

interface AlertToTrigger {
  id: number;
  user_id: number;
  amount: number;
}

export function getAlertsToTrigger(token: TokenType, availableCapacity: string): AlertToTrigger[] {
  // amount is stored in base units in DB, availableCapacity is also in base units
  return db.query(
    `SELECT id, user_id, amount FROM tracked_tokens
     WHERE token = ? AND amount <= ?`
  ).all(token, availableCapacity) as AlertToTrigger[];
}

export function deleteAlertsById(alertIds: number[]) {
  if (alertIds.length === 0) return;
  const placeholders = alertIds.map(() => "?").join(",");
  return db.run(
    `DELETE FROM tracked_tokens WHERE id IN (${placeholders})`,
    alertIds
  );
}

export function appendMessage(params: AppendMessageInput) {
  const { userId, role, content } = params;
  if (!getUser(userId)) return null;
  return db.run(
    "INSERT INTO conversations (user_id, role, content, created_at) VALUES (?, ?, ?, ?)",
    [userId, role, content, Math.floor(Date.now() / 1000)]
  );
}

export function loadConversation(params: LoadConversationInput) {
  const { userId, limit = 50 } = params;
  const rows = db
    .query(
      "SELECT role, content, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(userId, limit) as Array<{
    role: ConversationRole;
    content: string;
    created_at: number;
  }>;
  return rows.reverse();
}

export function clearConversation(userId: number) {
  return db.run("DELETE FROM conversations WHERE user_id = ?", [userId]);
}
