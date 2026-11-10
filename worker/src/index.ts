import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (_origin, c) => c.env.FRONTEND_ORIGIN,
    credentials: true,
  }),
);

app.get("/api/", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);
app.route("/api", catalogRoutes);

export default app;
