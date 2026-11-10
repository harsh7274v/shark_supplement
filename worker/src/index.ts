import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { ordersRoutes } from "./routes/orders";

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
app.route("/api", ordersRoutes);

export default app;
