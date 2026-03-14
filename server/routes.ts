// Thin index — mounts all route modules. Auth middleware is applied before protected routers.
// Route files live in server/routes/: authRoutes, registryRoutes, researchRoutes,
// jobRoutes, chatRoutes, dashboardRoutes.

import type { Express } from "express";
import type { Server } from "http";
import authRoutes, { isValidToken } from "./routes/authRoutes";
import registryRoutes from "./routes/registryRoutes";
import researchRoutes from "./routes/researchRoutes";
import jobRoutes from "./routes/jobRoutes";
import chatRoutes from "./routes/chatRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import { startJobRunner } from "./services/jobService";
import { startFmiJobRunner } from "./fmiResearchJobRunner";
import type { Request, Response, NextFunction } from "express";

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.authenticated) return next();
  const token = req.headers["x-auth-token"] as string | undefined;
  if (token && await isValidToken(token)) return next();
  res.status(401).json({ message: "Unauthorized" });
};

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use("/api", authRoutes);

  app.use("/api", requireAuth);

  app.use("/api", registryRoutes);
  app.use("/api", researchRoutes);
  app.use("/api", jobRoutes);
  app.use("/api", chatRoutes);
  app.use("/api", dashboardRoutes);

  startJobRunner();
  startFmiJobRunner();

  return httpServer;
}
