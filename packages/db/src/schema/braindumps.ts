import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export const braindumps = pgTable(
  "braindumps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("inbox"), // inbox | triaged | archived
    tags: jsonb("tags").$type<string[]>().default([]),
    suggestedIssueId: uuid("suggested_issue_id").references(() => issues.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("braindumps_company_status_idx").on(table.companyId, table.status, table.createdAt),
  }),
);
