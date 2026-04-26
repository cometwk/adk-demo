import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("User", {
  id: text("id").primaryKey().notNull(),
  email: text("email").notNull(),
  password: text("password"),
  name: text("name"),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isAnonymous: integer("isAnonymous", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type User = InferSelectModel<typeof user>;

export const chat = sqliteTable("Chat", {
  id: text("id").primaryKey().notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  title: text("title").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  visibility: text("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

// SQLite 用 text 存储 JSON 数据，使用 mode: "json" 自动转换
export const message = sqliteTable("Message_v2", {
  id: text("id").primaryKey().notNull(),
  chatId: text("chatId")
    .notNull()
    .references(() => chat.id),
  role: text("role").notNull(),
  parts: text("parts", { mode: "json" }).notNull(),
  attachments: text("attachments", { mode: "json" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = sqliteTable(
  "Vote_v2",
  {
    chatId: text("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: text("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: integer("isUpvoted", { mode: "boolean" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = sqliteTable(
  "Document",
  {
    id: text("id").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: text("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = sqliteTable(
  "Suggestion",
  {
    id: text("id").notNull(),
    documentId: text("documentId").notNull(),
    documentCreatedAt: integer("documentCreatedAt", { mode: "timestamp" }).notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: integer("isResolved", { mode: "boolean" }).notNull().default(false),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = sqliteTable(
  "Stream",
  {
    id: text("id").notNull(),
    chatId: text("chatId").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;