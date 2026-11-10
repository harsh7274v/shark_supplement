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

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const cardEntries = [
  { key: "revenue", label: "Revenue", valueKey: "revenue", testid: "stat-revenue", formatted: true },
  { key: "orders", label: "Orders", valueKey: "orders", testid: "stat-orders", formatted: false },
  { key: "avg-order", label: "Avg. Order", valueKey: "avg_order", testid: "stat-avg-order", formatted: true },
  { key: "low-stock", label: "Low Stock (≤ 10)", valueKey: "low_stock", testid: "stat-low-stock", formatted: false },
];

export default function Overview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

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

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleReset = async () => {
    setConfirmReset(false);
    try {
      await API.post("/admin/demo-data/reset");
      toast.success("Demo data reset");
      await fetchOverview();
    } catch (error) {
      toast.error(formatApiError(error) || "Reset failed");
    }
  };

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
            Key store aggregates over the last 30 days · {user?.email ? `Signed in as {user.email}` : ""}
          </p>
        </div>
        <div data-testid="demo-data-banner" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-amber-900">Demo data</p>
            <p className="text-xs text-amber-700">
              Resetting wipes all orders, payments and logs; the catalog stays untouched.
            </p>
          </div>
          {confirmReset ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                data-testid="reset-demo-data-cancel"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="reset-demo-data-confirm"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 transition-colors"
              >
                Reset
              </button>
            </div>
          ) : (
            <button
              data-testid="reset-demo-data"
              onClick={() => setConfirmReset(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Reset demo data
            </button>
          )}
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
          if (card.formatted) display = inr(display);
          return (
            <motion.div
              key={card.key}
              variants={CARD_VARIANTS}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.05 * i }}
              data-testid={card.testid}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
              <p className="mt-2 font-display font-black text-2xl text-slate-900">{display}</p>
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
          className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Revenue by day</h2>
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
                <Tooltip formatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`} />
                <Area type="monotone" dataKey="total" stroke="#FF3B30" fill="url(#color-revenue)" dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <AnimatePresence>
          {orders === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-96 rounded-2xl border border-slate-200 border-dashed bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-900">No sales yet</p>
              <p className="text-xs text-slate-400 mt-1">Reset demo data to seed the store.</p>
            </motion.div>
          ) : (
            <>
              <motion.div
                key="orders-by-status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Orders by status</h2>
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
                      <Bar dataKey="count" fill="url(#color-status)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              <motion.div
                key="top-products"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Top products</h2>
                <div data-testid="chart-top-products" className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="horizontal" data={topProducts}>
                      <defs>
                        <linearGradient id="color-products" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FF6B00" />
                          <stop offset="100%" stopColor="#FF3B30" />
                        </linearGradient>
                      </defs>
                      <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: "#64748B" }} />
                      <XAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
                      <Tooltip formatter={(value) => `${value} sold`} />
                      <Bar dataKey="qty" fill="url(#color-products)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {loading && (
        <div data-testid="overview-loading" className="flex h-96 items-center justify-center text-slate-400">
          Loading overview…
        </div>
      )}
    </div>
  );
}
