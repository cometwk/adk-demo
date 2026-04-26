import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { config } from "dotenv";

config({
  path: ".env.local",
});

const runMigrate = async () => {
  const sqlite = new Database("chatbot.db");
  const db = drizzle(sqlite);

  console.log("Running migrations...");

  const start = Date.now();

  // SQLite 不需要单独 migrations folder，直接在 queries.ts 中创建表
  // 如果有 migrations 文件夹，可以这样：
  // migrate(db, { migrationsFolder: "./lib/db/migrations" });

  // 直接执行建表 SQL
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      password TEXT,
      name TEXT,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      isAnonymous INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Chat (
      id TEXT PRIMARY KEY NOT NULL,
      createdAt INTEGER NOT NULL,
      title TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES User(id),
      visibility TEXT NOT NULL DEFAULT 'private'
    );

    CREATE TABLE IF NOT EXISTS Message_v2 (
      id TEXT PRIMARY KEY NOT NULL,
      chatId TEXT NOT NULL REFERENCES Chat(id),
      role TEXT NOT NULL,
      parts TEXT NOT NULL,
      attachments TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Vote_v2 (
      chatId TEXT NOT NULL REFERENCES Chat(id),
      messageId TEXT NOT NULL REFERENCES Message_v2(id),
      isUpvoted INTEGER NOT NULL,
      PRIMARY KEY (chatId, messageId)
    );

    CREATE TABLE IF NOT EXISTS Document (
      id TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      kind TEXT NOT NULL DEFAULT 'text',
      userId TEXT NOT NULL REFERENCES User(id),
      PRIMARY KEY (id, createdAt)
    );

    CREATE TABLE IF NOT EXISTS Suggestion (
      id TEXT NOT NULL,
      documentId TEXT NOT NULL,
      documentCreatedAt INTEGER NOT NULL,
      originalText TEXT NOT NULL,
      suggestedText TEXT NOT NULL,
      description TEXT,
      isResolved INTEGER NOT NULL DEFAULT 0,
      userId TEXT NOT NULL REFERENCES User(id),
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (id),
      FOREIGN KEY (documentId, documentCreatedAt) REFERENCES Document(id, createdAt)
    );

    CREATE TABLE IF NOT EXISTS Stream (
      id TEXT NOT NULL,
      chatId TEXT NOT NULL REFERENCES Chat(id),
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (id)
    );
  `);

  // 创建 mock 用户
  const MOCK_USER_ID = "mock-user-001";
  const existingUser = sqlite.prepare("SELECT id FROM User WHERE id = ?").get(MOCK_USER_ID);

  if (!existingUser) {
    const now = Date.now();
    sqlite.prepare(`
      INSERT INTO User (id, email, password, name, emailVerified, isAnonymous, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(MOCK_USER_ID, "mock@example.com", "mock-password-hash", "Mock User", 0, 0, now, now);
    console.log("Created mock user:", MOCK_USER_ID);
  }

  const end = Date.now();

  console.log("Migrations completed in", end - start, "ms");
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error("Migration failed");
  console.error(err);
  process.exit(1);
});