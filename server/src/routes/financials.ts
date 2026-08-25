import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { updateFinancialTargetSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { financialsService } from "../services/financials.js";
import { assertCompanyAccess } from "./authz.js";

export function financialRoutes(db: Db) {
  const router = Router();
  const svc = financialsService(db);

  router.get("/companies/:companyId/financials", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const metrics = await svc.getMetrics(companyId);
    res.json(metrics);
  });

  router.patch(
    "/companies/:companyId/financials",
    validate(updateFinancialTargetSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const updated = await svc.updateTarget(companyId, req.body);
      res.json(updated);
    },
  );

  return router;
}
