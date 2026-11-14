import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { API, inr, formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { Database, ShieldCheck, RefreshCw } from "lucide-react";

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const cardEntries = [
  { key: "revenue", label: "Revenue", valueKey: "revenue", testid: "stat-revenue", formatted: true, isPaise: true },
  { key: "orders", label: "Orders", valueKey: "orders", testid: "stat-orders", formatted: false },
  { key: "avg-order", label: "Avg. Order", valueKey: "avg_order", testid: "stat-avg-order", formatted: true, isPaise: true },
  { key: "low-stock", label: "Low Stock (≤ 10)", valueKey: "low_stock", testid: "stat-low-stock", formatted: false },
];

export default function Overview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [retentionStats, setRetentionStats] = useState(null);

  const fetchOverview = useCallback(async () => {
    try {
      const response = await API.get("/admin/overview", { params: { days: 30 } });
      setData(response.data);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRetentionStats = useCallback(async () => {
    try {
      const res = await API.get("/admin/maintenance/stats");
      setRetentionStats(res.data);
    } catch {
      // ignore
    }
  }, []);

  const handleRunCleanup = async () => {
    setCleaning(true);
    try {
      const res = await API.post("/admin/maintenance/cleanup");
      toast.success(
        `Cleanup complete: ${res.data.orders_anonymized} orders unlinked, ${res.data.email_logs_purged} email logs & ${res.data.sessions_purged} sessions purged.`,
      );
      await fetchRetentionStats();
      await fetchOverview();
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to run maintenance cleanup");
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchRetentionStats();
  }, [fetchOverview, fetchRetentionStats]);

  const stats = data?.stats ?? {};
  const revenueByDay = data?.revenue_by_day ?? [];
  const ordersByStatus = data?.orders_by_status ?? [];
  const topProducts = data?.top_products ?? [];
  const orders = stats.orders ?? 0;

  return (
    <div className="space-y-6">
      <motion.div
        variants={CARD_VARIANTS}
        initial="hidden"
        animate="show"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900">
            Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Key store aggregates over the last 30 days · {user?.email ? `Signed in as ${user.email}` : ""}
          </p>
        </div>
      </motion.div>

      <motion.div
        variants={CARD_VARIANTS}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {cardEntries.map((card, i) => {
          let display = stats[card.valueKey] ?? 0;
          if (card.formatted) display = inr(card.isPaise ? display / 100 : display);
          return (
            <motion.div
              key={card.key}
              variants={CARD_VARIANTS}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.05 * i }}
              data-testid={card.testid}
              className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] p-6 shadow-sm hover:shadow hover:-translate-y-0.5 transition-all duration-200"
            >
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{card.label}</p>
              <p className="mt-2 font-display font-black text-2xl sm:text-3xl text-slate-900 tracking-tight">{display}</p>
            </motion.div>
          );
        })}
      </motion.div>

      <div data-testid="overview-charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          variants={CARD_VARIANTS}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-3xl border border-slate-200/80 bg-[#F6F7F9] p-6 sm:p-7 shadow-sm"
        >
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-5">Revenue by day</h2>
          <div data-testid="chart-revenue-by-day" className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByDay}>
                <defs>
                  <linearGradient id="color-revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF3B30" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#FF3B30" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
                <Tooltip formatter={(value) => `₹${Math.round(Number(value) / 100).toLocaleString("en-IN")}`} />
                <Area type="monotone" dataKey="total" stroke="#FF3B30" fill="url(#color-revenue)" dot={false} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {!loading && orders === 0 ? (
          <motion.div
            key="empty"
            data-testid="overview-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-80 rounded-3xl border border-dashed border-slate-300 bg-[#F6F7F9] p-6 shadow-sm lg:col-span-2"
          >
            <p className="text-sm font-bold text-slate-900">No sales recorded yet</p>
            <p className="text-xs text-slate-400 mt-1">Reset demo data to generate sample orders and metrics.</p>
          </motion.div>
        ) : (
          <>
            <motion.div
              key="orders-by-status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] p-6 sm:p-7 shadow-sm"
            >
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-5">Orders by status</h2>
              <div data-testid="chart-orders-by-status" className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ordersByStatus}>
                    <defs>
                      <linearGradient id="color-status" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF3B30" />
                        <stop offset="100%" stopColor="#FF6B00" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="status" tick={{ fontSize: 11, fill: "#64748B" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
                    <Tooltip formatter={(value) => `${value} orders`} />
                    <Bar dataKey="count" fill="url(#color-status)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div
              key="top-products"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] p-6 sm:p-7 shadow-sm"
            >
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-5">Top products</h2>
              <div data-testid="chart-top-products" className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topProducts}>
                    <defs>
                      <linearGradient id="color-products" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF6B00" />
                        <stop offset="100%" stopColor="#FF3B30" />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: "#64748B" }} />
                    <Tooltip formatter={(value) => `${value} sold`} />
                    <Bar dataKey="qty" fill="url(#color-products)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* 3-MONTH RETENTION & STORAGE MAINTENANCE CARD */}
      <motion.div
        variants={CARD_VARIANTS}
        initial="hidden"
        animate="show"
        className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-800" />
            <h3 className="font-display font-black text-lg text-slate-900 tracking-tight">
              Data Retention &amp; Storage Optimization
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
              90-Day Policy Active
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Customer order history is restricted to 3 months (90 days) to prevent storage bloat.
            Admin maintains <strong>100% permanent records</strong> for tax, accounting, and business analytics.
            Running cleanup unlinks user profiles from orders older than 90 days, and purges expired sessions &amp; old email logs.
          </p>
          {retentionStats && (
            <div className="flex flex-wrap gap-4 pt-2 text-[11px] font-semibold text-slate-600">
              <span>Total Orders in DB: <strong className="text-slate-900">{retentionStats.total_orders_in_database}</strong></span>
              <span>Pending User Unlinking: <strong className="text-slate-900">{retentionStats.user_orders_pending_anonymization}</strong></span>
              <span>Old Email Logs: <strong className="text-slate-900">{retentionStats.email_logs_older_than_90_days}</strong></span>
              <span>Expired Sessions: <strong className="text-slate-900">{retentionStats.expired_sessions}</strong></span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleRunCleanup}
          disabled={cleaning}
          className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 shadow-sm transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cleaning ? "animate-spin" : ""}`} />
          <span>{cleaning ? "Pruning Storage…" : "Run Data Cleanup"}</span>
        </button>
      </motion.div>

      {loading && (
        <div data-testid="overview-loading" className="flex h-96 items-center justify-center text-slate-400">
          Loading overview…
        </div>
      )}
    </div>
  );
}
