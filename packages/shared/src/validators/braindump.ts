import { z } from "zod";

export const braindumpStatusSchema = z.enum(["inbox", "triaged", "archived"]);

export const braindumpItemSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  title: z.string(),
  content: z.string(),
  status: braindumpStatusSchema,
  tags: z.array(z.string()),
  suggestedIssueId: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createBraindumpSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateBraindumpSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  status: braindumpStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateBraindumpInput = z.infer<typeof createBraindumpSchema>;
export type UpdateBraindumpInput = z.infer<typeof updateBraindumpSchema>;
