import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { API, formatApiError, inr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Package, RotateCcw, CreditCard, MapPin, Truck, ExternalLink, ShieldCheck } from "lucide-react";

const STATUS_COLORS = {
  placed: "bg-kinetic-red/10 text-kinetic-red border-kinetic-red/20",
  confirmed: "bg-blue-50 text-blue-800 border-blue-100",
  shipped: "bg-violet-50 text-violet-800 border-violet-100",
  delivered: "bg-kinetic-volt/10 text-kinetic-volt border-kinetic-volt/20",
  cancelled: "bg-red-50 text-red-800 border-red-100",
};

const parseDate = (value) => new Date(String(value).replace(" ", "T"));

const statusLabel = (status) => status.charAt(0).toUpperCase() + status.slice(1);

const lineTotal = (item) => (item.unit_price ?? 0) * item.qty;

const variant = (item) => [item.flavor, item.weight].filter(Boolean).join(" · ") || "Standard";

function OrderCard({ order, refreshHistory, refreshing }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      data-testid={`my-orders-card-${order.id}`}
      className="rounded-2xl border border-slate-100 bg-white p-6 md:p-8 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            Order {order.order_number}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {parseDate(order.created_at).toLocaleDateString("en-IN")}
          </p>
        </div>
        <span
          data-testid={`my-orders-status-${order.id}`}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-tighter ${
            STATUS_COLORS[order.status] || STATUS_COLORS.placed
          }`}
        >
          {statusLabel(order.status)}
        </span>
      </div>

      {/* Items */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Items</p>
          <span
            className="text-xs font-bold text-slate-400"
            data-testid={`my-orders-items-count-${order.id}`}
          >
            {(order.items ?? []).reduce((s, i) => s + i.qty, 0)} items
          </span>
        </div>
        <div className="rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Product
                </th>
                <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 w-24">
                  Variant
                </th>
                <th className="p-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-16">
                  Unit
                </th>
                <th className="p-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-16">
                  Qty
                </th>
                <th className="p-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-20">
                  Line total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(order.items ?? []).map((item) => (
                <tr key={item.id} className="text-slate-600">
                  <td className="p-3" data-testid={`my-orders-item-name-${item.id}`}>
                    {item.name}
                  </td>
                  <td className="p-3 text-slate-500" data-testid={`my-orders-item-variant-${item.id}`}>
                    {variant(item)}
                  </td>
                  <td className="p-3 text-right font-semibold" data-testid={`my-orders-item-unit-${item.id}`}>
                    {inr((item.unit_price ?? 0) / 100)}
                  </td>
                  <td className="p-3 text-right font-semibold" data-testid={`my-orders-item-qty-${item.id}`}>
                    {item.qty}
                  </td>
                  <td className="p-3 text-right font-semibold" data-testid={`my-orders-item-line-${item.id}`}>
                    {inr(lineTotal(item) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals */}
      <section className="mt-6 space-y-1.5 text-sm font-semibold" data-testid={`my-orders-totals-${order.id}`}>
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{inr(order.subtotal / 100)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-emerald-600 font-extrabold">
            <span>{order.coupon_code} discount</span>
            <span>−{inr(order.discount / 100)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600">
          <span>GST (5%)</span>
          <span>{inr(order.gst / 100)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Express shipping</span>
          <span className={order.shipping === 0 ? "text-emerald-600 font-extrabold" : ""}>
            {order.shipping === 0 ? "FREE" : inr(order.shipping / 100)}
          </span>
        </div>
        <div className="flex justify-between border-t border-dashed border-slate-200 pt-2.5 mt-1 font-display font-black text-lg text-slate-900">
          <span>Total</span>
          <span>{inr(order.total / 100)}</span>
        </div>
      </section>

      {/* Delivery ETA */}
      {order.estimated_delivery_date && (
        <section className="mt-6 rounded-xl bg-slate-50 border border-slate-100 p-4" data-testid={`my-orders-eta-${order.id}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Expected delivery
          </p>
          <p className="text-sm text-slate-900" data-testid={`my-orders-eta-value-${order.id}`}>
            {parseDate(order.estimated_delivery_date).toLocaleDateString("en-IN")}
          </p>
        </section>
      )}

      {/* Courier Tracking Section (if shipped or tracking info available) */}
      {(order.courier_name || order.tracking_number || order.tracking_url) && (
        <section
          className="mt-6 rounded-xl bg-purple-50/70 border border-purple-100 p-4"
          data-testid={`my-orders-tracking-${order.id}`}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-purple-900">
                  {order.courier_name || "Courier Partner"} Tracking
                </p>
                {order.tracking_number && (
                  <p className="text-xs text-purple-700 font-semibold mt-0.5">
                    AWB / Tracking ID:{" "}
                    <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-purple-200">
                      {order.tracking_number}
                    </span>
                  </p>
                )}
              </div>
            </div>
            {order.tracking_url && /^https?:\/\//i.test(order.tracking_url) && (
              <a
                href={order.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition-all"
              >
                <span>Track Package</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Payment & Delivery Address Grid */}
      <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment Details */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4" data-testid={`my-orders-payment-${order.id}`}>
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Payment Information
            </p>
          </div>
          {order.payment ? (
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Method</span>
                <span className="font-bold text-slate-800 uppercase">
                  {order.payment.method === "cod"
                    ? "Cash on Delivery"
                    : order.payment.method === "upi"
                    ? "UPI"
                    : "Card / Net Banking"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    order.payment.status === "paid"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : order.payment.status === "on_delivery"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                  }`}
                >
                  {order.payment.status === "on_delivery"
                    ? "Pay on Delivery"
                    : order.payment.status}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">Paid / Due</span>
                <span className="font-extrabold text-slate-900">
                  {inr((order.payment.amount ?? order.total) / 100)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Payment details confirmed at checkout.</p>
          )}
        </div>

        {/* Delivery Address */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4" data-testid={`my-orders-address-${order.id}`}>
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Delivery Address
            </p>
          </div>
          {order.address ? (
            <div className="text-xs text-slate-600 space-y-0.5">
              <p className="font-bold text-slate-900">
                {order.address.full_name || order.name}
                {(order.address.phone || order.phone) && (
                  <span className="font-normal text-slate-500 ml-2">
                    • {order.address.phone || order.phone}
                  </span>
                )}
              </p>
              <p>{order.address.address}</p>
              {order.address.landmark && (
                <p className="text-slate-500">Landmark: {order.address.landmark}</p>
              )}
              <p>
                {[order.address.city, order.address.state, order.address.pincode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Address recorded on order invoice.</p>
          )}
        </div>
      </section>

      {/* Status history — vertical timeline */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Status history</p>
          <button
            data-testid={`my-orders-history-refresh-${order.id}`}
            onClick={() => refreshHistory(order.id)}
            disabled={refreshing}
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh timeline"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
        <div className="relative pl-8" data-testid={`my-orders-timeline-${order.id}`}>
          <span className="absolute left-3 top-2 bottom-0 w-0.5 bg-slate-200" />
          {(order.status_history ?? []).map((entry, index) => {
            const last = index === (order.status_history ?? []).length - 1;
            return (
              <div key={entry.id} className="relative mb-6" data-testid={`my-orders-history-${entry.id}`}>
                <span className="absolute -left-[2px] top-1 w-2 h-2 rounded-full border-2 border-slate-300 bg-white" />
                {last && (
                  <span className="absolute -left-[2px] top-5 bottom-[-6px] w-0.5 bg-slate-200" />
                )}
                <div className="flex-1">
                  <p
                    className="text-sm text-slate-900"
                    data-testid={`my-orders-history-status-${entry.id}`}
                  >
                    {statusLabel(entry.status)}{entry.note ? ` — ${entry.note}` : ""}
                  </p>
                  <p
                    className="text-[10px] text-slate-400"
                    data-testid={`my-orders-history-date-${entry.id}`}
                  >
                    {parseDate(entry.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            );
          })}
          {(order.status_history ?? []).length === 0 && (
            <p className="text-xs text-slate-400" data-testid={`my-orders-history-empty-${order.id}`}>
              No status changes yet.
            </p>
          )}
        </div>
      </section>
    </motion.div>
  );
}

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingOrder, setRefreshingOrder] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error?.response?.status === 401) {
        toast.error("Please sign in to view your orders.");
        setOrders([]);
      } else {
        toast.error(formatApiError(error) || "Failed to load orders");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchOrders();
    } else {
      setOrders([]);
      setLoading(false);
    }
  }, [user, fetchOrders]);

  const refreshHistory = useCallback(async (orderId) => {
    setRefreshingOrder(orderId);
    try {
      const { data } = await API.get(`/orders/${orderId}/status-history`);
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? { ...order, status_history: Array.isArray(data) ? data : order.status_history }
            : order,
        ),
      );
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to refresh timeline");
    } finally {
      setRefreshingOrder(null);
    }
  }, []);

  if (user === null) {
    return (
      <div className="min-h-screen bg-white py-12 px-6 flex flex-col items-center justify-center" data-testid="my-orders-page">
        <p className="text-slate-500 font-semibold">Loading your orders…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white py-12 px-6 text-center" data-testid="my-orders-page">
        <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="font-display font-bold text-2xl text-slate-900">Please sign in</h2>
        <p className="text-slate-500 mt-2">
          Your order history appears here once you're signed in.
        </p>
      </div>
    );
  }

  return (
    <section className="min-h-screen bg-white py-12 px-6" data-testid="my-orders-page">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-xs uppercase font-extrabold tracking-[0.28em] text-kinetic-red mb-3">
              My Orders
            </p>
            <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tight text-slate-900">
              Order history
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Showing active orders from the last 90 days. Older historical records are securely archived.</span>
            </p>
          </div>
          <button
            data-testid="my-orders-refresh"
            onClick={fetchOrders}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {refreshing ? <RotateCcw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Refresh
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="my-orders-empty">
            <Package className="w-16 h-16 text-slate-200 mb-4" />
            <h3 className="font-display font-bold text-xl text-slate-900">No orders yet</h3>
            <p className="text-slate-500 mt-2">
              Place an order and it will show up here with its tracking timeline.
            </p>
          </div>
        ) : (
          <div className="space-y-8" data-testid="my-orders-list">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} refreshHistory={refreshHistory} refreshing={refreshingOrder === order.id} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
