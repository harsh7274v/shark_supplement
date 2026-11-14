import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Search, Plus, Check, Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { API, inr, formatApiError } from "../../lib/api";
import { toast } from "sonner";

export default function NewArrivalsPicker({ onClose, onUpdated }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'not_added', 'added'
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    let alive = true;
    async function loadCatalog() {
      setLoading(true);
      try {
        const { data } = await API.get("/admin/products");
        if (alive) {
          setProducts(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (alive) {
          toast.error(formatApiError(error) || "Failed to load products");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }
    loadCatalog();
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const cat = p.category_name || p.category;
      if (cat && !map.has(cat)) {
        map.set(cat, cat);
      }
    });
    return Array.from(map.values()).sort();
  }, [products]);

  const toggleArrival = async (product, nextStatus) => {
    setTogglingId(product.id);
    try {
      await API.patch(`/admin/products/${product.id}`, { is_new_arrival: nextStatus });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_new_arrival: nextStatus } : p))
      );
      if (nextStatus === 1) {
        toast.success(`"${product.name}" added to New Arrivals`);
      } else {
        toast.success(`"${product.name}" removed from New Arrivals`);
      }
      onUpdated?.();
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to update new arrival status");
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      // Search filter
      const q = search.trim().toLowerCase();
      if (q) {
        const text = `${p.name} ${p.brand || ""} ${p.category_name || ""} ${p.category || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      // Category filter
      if (categoryFilter !== "all") {
        const cat = p.category_name || p.category;
        if (cat !== categoryFilter) return false;
      }
      // Status filter
      if (statusFilter === "not_added" && p.is_new_arrival === 1) return false;
      if (statusFilter === "added" && p.is_new_arrival !== 1) return false;

      return true;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const addedCount = useMemo(() => {
    return products.filter((p) => p.is_new_arrival === 1).length;
  }, [products]);

  const coverImage = (product) =>
    Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : "/api/images/catalog/whey_isolate.jpg";

  return (
    <div
      data-testid="admin-arrivals-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-hidden"
      data-lenis-prevent
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative z-10 w-full max-w-3xl max-h-[88vh] flex flex-col bg-[#F6F7F9] rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
        data-lenis-prevent
      >
        {/* Pinned Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-black text-xl text-slate-900 tracking-tight">
                  Add to New Arrivals
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Select products from your catalog to showcase in the New Arrivals section.
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="admin-arrivals-close"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100/80 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                data-testid="admin-arrivals-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name, brand, or category..."
                className="w-full pl-10 pr-4 py-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 focus:bg-white text-slate-900 text-xs focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto kinetic-scroll shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-600"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("not_added")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "not_added"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-600"
                }`}
              >
                Not Added
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("added")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "added"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                }`}
              >
                In Arrivals ({addedCount})
              </button>
            </div>
          </div>

          {/* Category Filter Chips */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto kinetic-scroll pt-2.5 pb-0.5 text-xs">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
                  categoryFilter === "all"
                    ? "bg-slate-200 text-slate-900"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
                    categoryFilter === cat
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Products List */}
        <div className="flex-1 overflow-y-auto kinetic-scroll p-4 sm:p-6 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <p className="text-sm font-medium">Loading catalog products…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center px-4">
              <p className="text-sm font-semibold text-slate-700">No products match your criteria</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting the search query or category filter.</p>
            </div>
          ) : (
            filtered.map((product) => {
              const isInArrivals = product.is_new_arrival === 1;
              const isToggling = togglingId === product.id;

              return (
                <div
                  key={product.id}
                  data-testid={`admin-arrivals-product-${product.id}`}
                  className={`flex items-center justify-between gap-4 p-3.5 rounded-2xl border transition-all ${
                    isInArrivals
                      ? "bg-emerald-50/40 border-emerald-200/70 shadow-sm"
                      : "bg-white/80 border-slate-200/60 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  {/* Left: Product Thumbnail & Details */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/60 shrink-0 flex items-center justify-center">
                      <img
                        src={coverImage(product)}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-sm tracking-tight truncate">
                          {product.name}
                        </p>
                        {product.brand && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {product.brand}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="text-slate-500 font-medium">
                          {product.category_name || product.category || "General"}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="font-bold text-slate-900">{inr(product.sale_price / 100)}</span>
                        {product.mrp > product.sale_price && (
                          <span className="text-slate-400 line-through text-[11px]">
                            {inr(product.mrp / 100)}
                          </span>
                        )}
                        <span className="text-slate-300">•</span>
                        <span className={`text-[11px] font-medium ${product.stock <= 10 ? "text-rose-600" : "text-slate-500"}`}>
                          Stock: {product.stock}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Action Button / Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isInArrivals ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100/80 text-emerald-800 text-xs font-bold border border-emerald-300/50">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>In Arrivals</span>
                        </span>
                        <button
                          type="button"
                          data-testid={`admin-arrivals-remove-${product.id}`}
                          onClick={() => toggleArrival(product, 0)}
                          disabled={isToggling}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors disabled:opacity-50"
                        >
                          {isToggling ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid={`admin-arrivals-add-${product.id}`}
                        onClick={() => toggleArrival(product, 1)}
                        disabled={isToggling}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                      >
                        {isToggling ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Adding…</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add to Arrivals</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pinned Sticky Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0">
          <div className="text-xs font-semibold text-slate-500">
            <span className="font-bold text-slate-900">{addedCount}</span> product{addedCount === 1 ? "" : "s"} currently in New Arrivals
          </div>
          <button
            type="button"
            data-testid="admin-arrivals-done"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

