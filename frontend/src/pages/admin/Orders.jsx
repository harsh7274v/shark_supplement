import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, RefreshCw } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { API, inr, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import OrderDetail from "./OrderDetail";

const STATUS_CHIPS = [
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const STATUS_COLORS = {
  placed: "bg-kinetic-red/10 text-kinetic-red border-kinetic-red/20",
  confirmed: "bg-blue-50 text-blue-800 border-blue-100",
  shipped: "bg-violet-50 text-violet-800 border-violet-100",
  delivered: "bg-kinetic-volt/10 text-kinetic-volt border-kinetic-volt/20",
  cancelled: "bg-red-50 text-red-800 border-red-100",
};

export default function Orders() {
  const { id: orderId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      const { data } = await API.get("/admin/orders", {
        params: { status: statusFilter || undefined, q: search || undefined },
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleFilter = (key) => setStatusFilter(key === "all" ? "" : key);
  const handleView = (id) => navigate(`/admin/orders/${id}`);
  const handleCloseDetail = () => navigate("/admin/orders");

  const isFilterActive = (key) =>
    key === "all" ? !statusFilter : statusFilter === key;

  const rowClass = (order) =>
    `hover:bg-slate-50 transition-colors ${
      order.status === "placed" ? "bg-kinetic-red/10 border-l-2 border-l-kinetic-red" : ""
    }`;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900">
            Orders
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            All store orders, newest day first · placed orders are highlighted and listed first
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              data-testid="admin-orders-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order number, customer name or email"
              className="w-full pl-10 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <button
              data-testid="admin-refresh-orders"
              onClick={fetchOrders}
              disabled={refreshing}
              className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {STATUS_CHIPS.map((chip) => {
              const active = isFilterActive(chip.key);
              return (
                <button
                  key={chip.key}
                  data-testid={`admin-order-filter-${chip.key}`}
                  onClick={() => handleFilter(chip.key)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    active
                      ? "bg-kinetic-red text-white border-kinetic-red"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <AnimatePresence>
          {loading ? (
            <div key="loading" data-testid="admin-orders-loading" className="flex h-80 items-center justify-center text-slate-400 px-6">
              Loading orders…
            </div>
          ) : (
            <div key="table">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-32">Order</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Customer</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-16">Items</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Total</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-24">Payment</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-16">Status</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-16">Date</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((order) => (
                    <tr
                      key={order.id}
                      data-testid={`admin-order-row-${order.id}`}
                      className={rowClass(order)}
                    >
                      <td className="p-4">
                        <span
                          data-testid={`admin-order-number-${order.id}`}
                          className="font-semibold text-slate-900"
                        >
                          {order.order_number}
                        </span>
                      </td>
                      <td className="p-4">
                        <p
                          data-testid={`admin-order-customer-${order.id}`}
                          className="text-sm font-medium text-slate-900"
                        >
                          {order.name}
                        </p>
                        {order.email && (
                          <p
                            data-testid={`admin-order-email-${order.id}`}
                            className="text-xs text-slate-500"
                          >
                            {order.email}
                          </p>
                        )}
                      </td>
                      <td className="p-4" data-testid={`admin-order-items-${order.id}`}>
                        {order.item_count}
                      </td>
                      <td className="p-4" data-testid={`admin-order-total-${order.id}`}>
                        {inr((order.total ?? 0) / 100)}
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-order-payment-${order.id}`}
                          className="text-sm text-slate-600"
                        >
                          {(order.payment_method ?? "—").replace(/_/g, " ")}
                        </span>
                        {order.payment_status && (
                          <p
                            data-testid={`admin-order-payment-status-${order.id}`}
                            className="text-xs text-slate-400"
                          >
                            {order.payment_status.replace(/_/g, " ")}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-order-status-${order.id}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-tighter ${
                            STATUS_COLORS[order.status] || STATUS_COLORS.placed
                          }`}
                        >
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-order-date-${order.id}`}
                          className="text-xs text-slate-500"
                        >
                          {new Date(order.created_at.replace(" ", "T")).toLocaleDateString(
                            "en-IN",
                          )}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          data-testid={`admin-order-view-${order.id}`}
                          onClick={() => handleView(order.id)}
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                          title="View order"
                        >
                          <span className="sr-only">View order</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-16 text-center text-slate-500" data-testid="admin-orders-empty">
                        No orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Right-drawer order detail, opened from the orders list or via /admin/orders/:id */}
      {orderId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleCloseDetail}
            data-testid="admin-order-detail-overlay"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <OrderDetail orderId={orderId} onClose={handleCloseDetail} />
        </>
      )}
    </div>
  );
}
