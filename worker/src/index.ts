import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { ordersRoutes } from "./routes/orders";
import { uploadRoutes } from "./routes/uploads";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (_origin, c) => c.env.FRONTEND_ORIGIN,
    credentials: true,
  }),
);

// CSRF Defense: For state-mutating requests (POST, PUT, PATCH, DELETE),
// if an Origin header is provided by the browser, it must match FRONTEND_ORIGIN
// or the worker's own origin to prevent cross-site request forgery via SameSite=None cookies.
app.use("*", async (c, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin) {
      const allowedOrigin = c.env.FRONTEND_ORIGIN;
      let requestOrigin = "";
      try {
        requestOrigin = new URL(c.req.url).origin;
      } catch {
        // Ignored
      }
      if (origin !== allowedOrigin && origin !== requestOrigin) {
        return c.json({ detail: "Cross-origin request forbidden" }, 403);
      }
    }
  }
  return next();
});

app.get("/api/", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);
app.route("/api", catalogRoutes);
app.route("/api", ordersRoutes);
app.route("/api", uploadRoutes);
app.route("/api/admin", adminRoutes);

export default app;
