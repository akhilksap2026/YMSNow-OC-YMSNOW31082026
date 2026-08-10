import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import fs from "fs";
import router from "./routes";
import { registerYmsRoutes } from "./lib/register-yms-routes";

const app: Express = express();

app.use(compression());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

registerYmsRoutes(app);

// Global error handler — catches unhandled errors from route handlers.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled route error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Catch-all JSON 404 for unmatched /api routes so they never fall through to
// the static file handler or SPA fallback and return HTML by mistake.
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Serve built frontend static files in production.
// The frontend is built to replit/artifacts/yms/dist/public/.
// When the run command does `cd replit && node artifacts/api-server/dist/index.cjs`,
// process.cwd() == replit/, so the static dir is a predictable relative path.
const staticDir = path.join(process.cwd(), "artifacts/yms/dist/public");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // SPA fallback — return index.html for any non-API GET so client-side routing works.
  // Express 5 requires named wildcards; bare `*` throws a path-to-regexp error.
  // Guard against /api/* so unmatched API routes still get a proper JSON 404, not HTML.
  app.get("/*splat", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
