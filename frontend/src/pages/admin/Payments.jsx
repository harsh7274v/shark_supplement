import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API, inr, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import DurationFilter, { isWithinDateRange } from "./DurationFilter";

const PAYMENT_COLORS = {
  paid: "bg-kinetic-volt/10 text-kinetic-volt border-kinetic-volt/20",
  on_delivery: "bg-blue-50 text-blue-800 border-blue-100",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  failed: "bg-red-50 text-red-800 border-red-100",
  refunded: "bg-violet-50 text-violet-800 border-violet-100",
  pending: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function Payments() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [duration, setDuration] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      const { data } = await API.get("/admin/payments", {
        params: {
          from: dateFrom || undefined,
          to: dateTo || undefined,
        },
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load payments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const filtered = items.filter((payment) => {
    // 1. Duration filter
    if (!isWithinDateRange(payment.created_at, dateFrom, dateTo)) {
      return false;
    }
    // 2. Search query filter
    const query = search.toLowerCase();
    if (!query) return true;
    const haystack = [
      payment.order_number,
      payment.method,
      payment.id,
      payment.status,
    ]
      .map((value) => (value == null ? "" : String(value)))
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const total = filtered.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900">
            Payments
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Every payment of the store, newest first · amounts in rupees
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              data-testid="admin-payments-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, method or payment id"
              className="w-full pl-10 pr-4 py-2 rounded-2xl border border-slate-200 bg-[#F6F7F9] text-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 outline-none transition-all text-xs"
            />
          </div>

          {/* Duration Dropdown: 7 days, month, 3 months, year, custom */}
          <DurationFilter
            value={duration}
            from={dateFrom}
            to={dateTo}
            onChange={({ duration: d, from: f, to: t }) => {
              setDuration(d);
              setDateFrom(f);
              setDateTo(t);
            }}
          />

          <button
            data-testid="admin-refresh-payments"
            onClick={fetchPayments}
            disabled={refreshing}
            className="w-9 h-9 rounded-2xl border border-slate-200 bg-[#F6F7F9] text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-xs flex items-center justify-center disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </motion.div>

      {/* Payments Table - Dusky White Box */}
      <div className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] shadow-sm overflow-hidden">
        <AnimatePresence>
          {loading ? (
            <div key="loading" data-testid="admin-payments-loading" className="flex h-80 items-center justify-center text-slate-400 px-6 font-medium">
              Loading payments…
            </div>
          ) : (
            <div key="table" className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/70">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-24">Payment</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Order</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-24">Method</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Amount</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Status</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((payment) => (
                    <tr
                      key={payment.id}
                      data-testid={`admin-payment-row-${payment.id}`}
                      className="hover:bg-slate-100/60 transition-colors"
                    >
                      <td className="p-4">
                        <span data-testid={`admin-payment-id-${payment.id}`} className="font-semibold text-slate-600">
                          {payment.id}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          data-testid={`admin-payment-order-${payment.id}`}
                          onClick={() => navigate(`/admin/orders/${payment.order_id}`)}
                          className="text-sm font-medium text-kinetic-red hover:underline transition-colors"
                        >
                          {payment.order_number}
                        </button>
                      </td>
                      <td className="p-4" data-testid={`admin-payment-method-${payment.id}`}>
                        {(payment.method ?? "—").replace(/_/g, " ")}
                      </td>
                      <td className="p-4" data-testid={`admin-payment-amount-${payment.id}`}>
                        {inr((payment.amount ?? 0) / 100)}
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-payment-status-${payment.id}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-tighter ${
                            PAYMENT_COLORS[payment.status] || PAYMENT_COLORS.pending
                          }`}
                        >
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-payment-date-${payment.id}`}
                          className="text-xs text-slate-500"
                        >
                          {new Date(payment.created_at.replace(" ", "T")).toLocaleDateString(
                            "en-IN",
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-16 text-center text-slate-500 font-medium" data-testid="admin-payments-empty">
                        No payments found for the selected duration or filter.
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={3} className="p-4 text-right font-semibold text-slate-900">
                      Total
                    </td>
                    <td className="p-4 font-display font-black text-lg text-slate-900" data-testid="admin-payments-total">
                      {inr(total / 100)}
                    </td>
                    <td colSpan={2} className="p-4" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
