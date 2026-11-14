import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, Edit2, RefreshCw, X, Ticket } from "lucide-react";
import { API, inr, formatApiError } from "../../lib/api";
import { toast } from "sonner";

const TYPE_LABEL = {
  percent: "Percent off",
  flat: "Flat ₹ off",
};

const couponValue = (coupon) =>
  coupon.discount_type === "percent"
    ? `${coupon.discount_value}%`
    : inr(coupon.discount_value / 100);

export default function Coupons() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "",
    min_order: "",
    active: "1",
    single_use_per_user: "1",
  });
  const [errors, setErrors] = useState({});

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      const { data } = await API.get("/admin/coupons");
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load coupons");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const validate = () => {
    const next = {};
    if (!form.code.trim()) {
      next.code = "Coupon code is required";
    }
    if (!["percent", "flat"].includes(form.discount_type)) {
      next.discount_type = "Discount type must be percent or flat";
    }
    const value = Number(form.discount_value);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      next.discount_value = "Discount value must be a whole number ≥ 0";
    }
    const minOrder = Number(form.min_order);
    if (!Number.isFinite(minOrder) || minOrder < 0 || !Number.isInteger(minOrder)) {
      next.min_order = "Min order must be a whole number ≥ 0";
    }
    setErrors(next);
    return Object.keys(next).length > 0;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (validate()) {
      return;
    }
    setSaving(true);
    try {
      const value = Number(form.discount_value);
      const minOrder = Number(form.min_order);
      const payload = {
        code: form.code.trim(),
        discount_type: form.discount_type,
        // The API stores paise integers. Flat ₹ values are rupees in the form,
        // so convert to paise; percent stays raw (percentage points).
        discount_value:
          form.discount_type === "flat" ? Math.round(value * 100) : Math.round(value),
        min_order: Math.round(minOrder * 100),
        active: form.active === "1" ? 1 : 0,
        single_use_per_user: form.single_use_per_user === "1" ? 1 : 0,
      };
      if (editing) {
        await API.patch(`/admin/coupons/${editing.id}`, payload);
        toast.success("Coupon updated");
      } else {
        await API.post("/admin/coupons", payload);
        toast.success("Coupon created");
      }
      closeForm();
      await fetchCoupons();
    } catch (error) {
      toast.error(formatApiError(error) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this coupon? It will no longer apply to orders.")) {
      return;
    }
    setDeleting(id);
    try {
      await API.delete(`/admin/coupons/${id}`);
      toast.success("Coupon deleted");
      await fetchCoupons();
    } catch (error) {
      toast.error(formatApiError(error) || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    setForm({
      code: "",
      discount_type: "percent",
      discount_value: "",
      min_order: "",
      active: "1",
      single_use_per_user: "1",
    });
    setErrors({});
  };

  const activeBadge = (coupon) =>
    coupon.active === 1
      ? "bg-kinetic-volt/10 text-kinetic-volt border-kinetic-volt/20"
      : "bg-slate-100 text-slate-500 border-slate-200";

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900">
            Coupons
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Discount codes buyers apply at checkout · values in rupees
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            data-testid="admin-refresh-coupons"
            onClick={fetchCoupons}
            disabled={refreshing}
            className="w-9 h-9 rounded-2xl border border-slate-200 bg-[#F6F7F9] text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-xs flex items-center justify-center disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            data-testid="admin-coupon-add"
            onClick={() => {
              setEditing(null);
              setForm({
                code: "",
                discount_type: "percent",
                discount_value: "",
                min_order: "",
                active: "1",
              });
              setErrors({});
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Add coupon
          </button>
        </div>
      </motion.div>

      {/* Coupons Table - Dusky White Box */}
      <div className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] shadow-sm overflow-hidden">
        <AnimatePresence>
          {loading ? (
            <div key="loading" data-testid="admin-coupons-loading" className="flex h-80 items-center justify-center text-slate-400 px-6">
              Loading coupons…
            </div>
          ) : (
            <div key="table" className="overflow-x-auto">
              {items.length === 0 ? (
                <div data-testid="admin-coupons-empty" className="p-12 text-center text-slate-500 font-medium">
                  No coupons yet.
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/70">
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Code</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-28">Type</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-24">Value</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-28">Min order</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-32">Usage Limit</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-24">Status</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80">
                    {items.map((coupon) => (
                      <tr
                        key={coupon.id}
                        data-testid={`admin-coupon-row-${coupon.id}`}
                        className="hover:bg-slate-100/60 transition-colors"
                      >
                        <td className="p-4">
                          <span
                            data-testid={`admin-coupon-code-${coupon.id}`}
                            className="font-bold text-slate-900 font-mono tracking-tight"
                          >
                            {coupon.code}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-semibold text-slate-600" data-testid={`admin-coupon-type-${coupon.id}`}>
                          {TYPE_LABEL[coupon.discount_type] ?? coupon.discount_type}
                        </td>
                        <td className="p-4 font-bold text-slate-900" data-testid={`admin-coupon-value-${coupon.id}`}>
                          {couponValue(coupon)}
                        </td>
                        <td className="p-4 text-slate-600 font-medium" data-testid={`admin-coupon-min-order-${coupon.id}`}>
                          {inr(coupon.min_order / 100)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                              coupon.single_use_per_user !== 0
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {coupon.single_use_per_user !== 0 ? "1 use / user" : "Multi-use"}
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            data-testid={`admin-coupon-active-${coupon.id}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-tighter ${
                              activeBadge(coupon)
                            }`}
                          >
                            {coupon.active === 1 ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              data-testid={`admin-coupon-edit-${coupon.id}`}
                              onClick={() => {
                                setEditing(coupon);
                                setForm({
                                  code: coupon.code,
                                  discount_type: coupon.discount_type,
                                  discount_value: String(coupon.discount_value / 100),
                                  min_order: String(coupon.min_order / 100),
                                  active: String(coupon.active),
                                  single_use_per_user: String(coupon.single_use_per_user ?? 1),
                                });
                                setErrors({});
                                setOpen(true);
                              }}
                              className="w-8 h-8 rounded-xl border border-slate-200/80 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm flex items-center justify-center transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              data-testid={`admin-coupon-delete-${coupon.id}`}
                              onClick={() => handleDelete(coupon.id)}
                              disabled={deleting === coupon.id}
                              className="w-8 h-8 rounded-xl border border-slate-200/80 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-sm flex items-center justify-center disabled:opacity-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" data-lenis-prevent>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeForm}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto kinetic-scroll bg-[#F6F7F9] rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-7"
              data-lenis-prevent
            >
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
                <h2 className="font-display font-black text-xl text-slate-900 tracking-tight">
                  {editing ? "Edit coupon" : "Add coupon"}
                </h2>
                <button
                  type="button"
                  data-testid="admin-coupon-form-close"
                  onClick={closeForm}
                  className="w-8 h-8 rounded-full bg-slate-100/80 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Code
                  </label>
                  <input
                    data-testid="admin-coupon-code"
                    value={form.code}
                    onChange={(event) => setField("code", event.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                      errors.code ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                    }`}
                    placeholder="e.g. TOM10"
                  />
                  {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Type
                  </label>
                  <select
                    data-testid="admin-coupon-type"
                    value={form.discount_type}
                    onChange={(event) => setField("discount_type", event.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                  >
                    <option value="percent">Percent off</option>
                    <option value="flat">Flat ₹ off</option>
                  </select>
                  {errors.discount_type && <p className="text-xs text-red-600 mt-1">{errors.discount_type}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Value
                  </label>
                  <input
                    data-testid="admin-coupon-value"
                    type="text"
                    value={form.discount_value}
                    onChange={(event) => setField("discount_value", event.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                      errors.discount_value ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                    }`}
                    placeholder={form.discount_type === "percent" ? "e.g. 10" : "e.g. 100"}
                  />
                  {errors.discount_value && <p className="text-xs text-red-600 mt-1">{errors.discount_value}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Min order (₹)
                  </label>
                  <input
                    data-testid="admin-coupon-min-order"
                    type="text"
                    value={form.min_order}
                    onChange={(event) => setField("min_order", event.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                      errors.min_order ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                    }`}
                    placeholder="e.g. 999"
                  />
                  {errors.min_order && <p className="text-xs text-red-600 mt-1">{errors.min_order}</p>}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <input
                      data-testid="admin-coupon-single-use"
                      id="single_use_per_user"
                      type="checkbox"
                      checked={form.single_use_per_user === "1"}
                      onChange={(event) => setField("single_use_per_user", event.target.checked ? "1" : "0")}
                      className="w-4 h-4 rounded border-slate-300 text-kinetic-red focus:ring-kinetic-red"
                    />
                    <label htmlFor="single_use_per_user" className="text-sm font-bold text-slate-900 cursor-pointer">
                      Single use per customer (Recommended)
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 pl-7 leading-relaxed">
                    Protects security: Each customer account or email can only use this coupon once across all orders.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    data-testid="admin-coupon-active"
                    type="checkbox"
                    checked={form.active === "1"}
                    onChange={(event) => setField("active", event.target.checked ? "1" : "0")}
                    className="w-4 h-4 rounded border-slate-300 text-kinetic-red focus:ring-kinetic-red"
                  />
                  <label className="text-sm font-semibold text-slate-700">Active</label>
                  {errors.active && <p className="text-xs text-red-600">{errors.active}</p>}
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    data-testid="admin-coupon-cancel"
                    type="button"
                    onClick={closeForm}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="admin-coupon-save"
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? "Saving…" : "Save coupon"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
