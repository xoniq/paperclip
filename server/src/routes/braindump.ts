import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createBraindumpSchema,
  updateBraindumpSchema,
  braindumpStatusSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { braindumpService } from "../services/braindump.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { notFound } from "../errors.js";

export function braindumpRoutes(db: Db) {
  const router = Router();
  const svc = braindumpService(db);

  router.get("/companies/:companyId/braindumps", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const statusParam = req.query.status as string | undefined;
    const status = braindumpStatusSchema.safeParse(statusParam).success
      ? (statusParam as any)
      : undefined;
    const list = await svc.list(companyId, status);
    res.json(list);
  });

  router.post(
    "/companies/:companyId/braindumps",
    validate(createBraindumpSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const item = await svc.create(companyId, req.body, actor.actorId);
      res.status(201).json(item);
    },
  );

  router.patch(
    "/companies/:companyId/braindumps/:id",
    validate(updateBraindumpSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);
      const updated = await svc.update(id, companyId, req.body);
      if (!updated) throw notFound("Braindump item not found");
      res.json(updated);
    },
  );

  router.delete("/companies/:companyId/braindumps/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const deleted = await svc.remove(id, companyId);
    if (!deleted) throw notFound("Braindump item not found");
    res.status(204).end();
  });

  router.post("/companies/:companyId/braindumps/:id/triage", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const result = await svc.triageWithAgent(id, companyId, actor.actorId);
    if (!result) throw notFound("Braindump item not found");
    res.json(result);
  });

  return router;
}
