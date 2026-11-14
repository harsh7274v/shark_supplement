import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, RefreshCw, ShoppingBag, Eye, ArrowRight, ShieldCheck, ChevronRight } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { API, inr, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import OrderDetail from "./OrderDetail";
import DurationFilter, { isWithinDateRange } from "./DurationFilter";

const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS = {
  placed: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  confirmed: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  shipped: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  delivered: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

export default function Orders() {
  const { id: orderId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [duration, setDuration] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounce the search so the list isn't refetched on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      const { data } = await API.get("/admin/orders", {
        params: {
          status: statusFilter || undefined,
          q: debouncedSearch || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        },
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, debouncedSearch, dateFrom, dateTo]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleFilter = (key) => setStatusFilter(key === "all" ? "" : key);
  const handleView = (id) => navigate(`/admin/orders/${id}`);
  const handleCloseDetail = () => navigate("/admin/orders");

  const isFilterActive = (key) =>
    key === "all" ? !statusFilter : statusFilter === key;

  // Filter items client-side as well for instant feedback
  const filteredItems = items.filter((order) =>
    isWithinDateRange(order.created_at, dateFrom, dateTo)
  );

  const rowClass = (order) =>
    `hover:bg-slate-100/70 transition-colors ${
      order.status === "placed"
        ? "bg-amber-50/40 border-l-4 border-l-amber-500"
        : ""
    }`;

  return (
    <div className="space-y-6">
      {/* 1. Header with Title & Modern Search + Duration Dropdown */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900 flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-slate-900" />
            <span>Orders</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            All store orders, newest day first · placed orders are highlighted
          </p>
        </div>

        {/* Modern Search Bar, Duration Dropdown & Refresh Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              data-testid="admin-orders-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, customer, email…"
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
            data-testid="admin-refresh-orders"
            onClick={fetchOrders}
            disabled={refreshing}
            className="w-9 h-9 rounded-2xl border border-slate-200 bg-[#F6F7F9] text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-xs flex items-center justify-center shrink-0 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </motion.div>

      {/* 2. Modern Status Filter Tabs Strip */}
      <div className="flex items-center gap-2 overflow-x-auto kinetic-scroll pb-1">
        {STATUS_CHIPS.map((chip) => {
          const active = isFilterActive(chip.key);
          return (
            <button
              key={chip.key}
              data-testid={`admin-order-filter-${chip.key}`}
              onClick={() => handleFilter(chip.key)}
              className={`whitespace-nowrap px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-xs ${
                active
                  ? "bg-slate-900 text-white shadow-slate-900/10"
                  : "bg-[#F6F7F9] text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* 3. Orders Table - Dusky White Box */}
      <div className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] shadow-sm overflow-hidden">
        <AnimatePresence>
          {loading ? (
            <div
              key="loading"
              data-testid="admin-orders-loading"
              className="flex h-80 items-center justify-center text-slate-400 px-6 font-medium"
            >
              Loading orders…
            </div>
          ) : (
            <div key="table" className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/70">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-32">Order</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Customer</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Items</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-28">Total</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-28">Payment</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-28">Status</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-28">Date</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-32 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((order) => (
                    <tr
                      key={order.id}
                      data-testid={`admin-order-row-${order.id}`}
                      className={rowClass(order)}
                    >
                      <td className="p-4">
                        <span
                          data-testid={`admin-order-number-${order.id}`}
                          className="font-bold text-slate-900 tracking-tight"
                        >
                          {order.order_number}
                        </span>
                      </td>
                      <td className="p-4">
                        <p
                          data-testid={`admin-order-customer-${order.id}`}
                          className="text-sm font-bold text-slate-900 leading-tight"
                        >
                          {order.name}
                        </p>
                        {order.email && (
                          <p
                            data-testid={`admin-order-email-${order.id}`}
                            className="text-xs text-slate-400 font-medium mt-0.5 truncate max-w-[200px]"
                          >
                            {order.email}
                          </p>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-slate-600" data-testid={`admin-order-items-${order.id}`}>
                        {order.item_count}
                      </td>
                      <td className="p-4 font-black text-slate-900" data-testid={`admin-order-total-${order.id}`}>
                        {inr((order.total ?? 0) / 100)}
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-order-payment-${order.id}`}
                          className="text-xs font-bold uppercase tracking-wider text-slate-700 block"
                        >
                          {(order.payment_method ?? "—").replace(/_/g, " ")}
                        </span>
                        {order.payment_status && (
                          <span
                            data-testid={`admin-order-payment-status-${order.id}`}
                            className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
                          >
                            {order.payment_status.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span
                          data-testid={`admin-order-status-${order.id}`}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black border uppercase tracking-wider ${
                            STATUS_COLORS[order.status] || STATUS_COLORS.placed
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span
                          data-testid={`admin-order-date-${order.id}`}
                          className="text-xs font-medium text-slate-500"
                        >
                          {new Date(order.created_at.replace(" ", "T")).toLocaleDateString("en-IN")}
                        </span>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button
                          data-testid={`admin-order-view-${order.id}`}
                          onClick={() => handleView(order.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/80 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold shadow-sm transition-all active:scale-95"
                          title="View order"
                        >
                          <span>View order</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-16 text-center text-slate-500 font-medium" data-testid="admin-orders-empty">
                        No orders found for the selected duration or filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* 4. Order Detail Modal Box rendered cleanly into Portal */}
      <AnimatePresence>
        {orderId && (
          <OrderDetail
            key={orderId}
            orderId={orderId}
            onClose={handleCloseDetail}
            onUpdated={fetchOrders}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
