import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { getCalendarQuerySchema } from "@paperclipai/shared";
import { calendarService } from "../services/calendar.js";
import { assertCompanyAccess } from "./authz.js";

export function calendarRoutes(db: Db) {
  const router = Router();
  const svc = calendarService(db);

  router.get("/companies/:companyId/calendar", async (req, res) => {
    assertCompanyAccess(req, req.params.companyId);
    const parsedQuery = getCalendarQuerySchema.safeParse(req.query);
    const result = await svc.getEvents(
      req.params.companyId,
      parsedQuery.success ? parsedQuery.data : undefined,
    );
    res.json(result);
  });

  return router;
}
