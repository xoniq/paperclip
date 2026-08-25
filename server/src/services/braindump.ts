import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { braindumps, issues } from "@paperclipai/db";
import type {
  BraindumpItem,
  BraindumpStatus,
  CreateBraindump,
  UpdateBraindump,
} from "@paperclipai/shared";
import { issueService } from "./issues.js";

function toBraindumpItem(row: typeof braindumps.$inferSelect): BraindumpItem {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    content: row.content,
    status: row.status as BraindumpStatus,
    tags: Array.isArray(row.tags) ? row.tags : [],
    suggestedIssueId: row.suggestedIssueId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function braindumpService(db: Db) {
  const list = async (companyId: string, status?: BraindumpStatus): Promise<BraindumpItem[]> => {
    const conditions = [eq(braindumps.companyId, companyId)];
    if (status) {
      conditions.push(eq(braindumps.status, status));
    }

    const rows = await db
      .select()
      .from(braindumps)
      .where(and(...conditions))
      .orderBy(desc(braindumps.createdAt));

    return rows.map(toBraindumpItem);
  };

  const create = async (
    companyId: string,
    input: CreateBraindump,
    userId?: string | null,
  ): Promise<BraindumpItem> => {
    const [row] = await db
      .insert(braindumps)
      .values({
        companyId,
        title: input.title,
        content: input.content ?? "",
        tags: input.tags ?? [],
        status: "inbox",
        createdByUserId: userId ?? null,
      })
      .returning();

    return toBraindumpItem(row);
  };

  const update = async (
    id: string,
    companyId: string,
    input: UpdateBraindump,
  ): Promise<BraindumpItem | null> => {
    const [row] = await db
      .update(braindumps)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(braindumps.id, id), eq(braindumps.companyId, companyId)))
      .returning();

    return row ? toBraindumpItem(row) : null;
  };

  const remove = async (id: string, companyId: string): Promise<boolean> => {
    const res = await db
      .delete(braindumps)
      .where(and(eq(braindumps.id, id), eq(braindumps.companyId, companyId)))
      .returning({ id: braindumps.id });

    return res.length > 0;
  };

  const triageWithAgent = async (
    id: string,
    companyId: string,
    userId?: string | null,
  ) => {
    const [item] = await db
      .select()
      .from(braindumps)
      .where(and(eq(braindumps.id, id), eq(braindumps.companyId, companyId)));

    if (!item) return null;

    const issueSvc = issueService(db);
    const newIssue = await issueSvc.create(companyId, {
      title: item.title,
      description: item.content || `Created from Braindump item: ${item.title}`,
      status: "todo",
      priority: "medium",
    });

    const [updated] = await db
      .update(braindumps)
      .set({
        status: "triaged",
        suggestedIssueId: newIssue.id,
        updatedAt: new Date(),
      })
      .where(eq(braindumps.id, id))
      .returning();

    return {
      braindump: toBraindumpItem(updated),
      issue: newIssue,
    };
  };

  return {
    list,
    create,
    update,
    remove,
    triageWithAgent,
  };
}

export type BraindumpService = ReturnType<typeof braindumpService>;
