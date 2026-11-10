import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, Edit2, Search, RefreshCw } from "lucide-react";
import { API, inr, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import ProductForm from "./ProductForm";

const STATUS_COLORS = {
  active: "bg-kinetic-volt/10 text-kinetic-volt border-kinetic-volt/20",
  inactive: "bg-slate-100 text-slate-500 border-slate-200",
};

const BADGE_STYLES = {
  NEW: "bg-kinetic-ink text-white",
  HOT: "bg-kinetic-red text-white",
  none: "bg-slate-100 text-slate-400",
};

export default function Products({ tab = "list" }) {
  const isArrivals = tab === "arrivals";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toggling, setToggling] = useState(new Set());
  const [deleting, setDeleting] = useState(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/admin/products");
      let list = Array.isArray(data) ? data : [];
      if (isArrivals) {
        list = list.filter((product) => product.is_new_arrival === 1);
      }
      setItems(list);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [isArrivals]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered = items.filter((product) => {
    const query = search.toLowerCase();
    if (!query) return true;
    const haystack = [
      product.name,
      product.brand,
      product.category,
      product.category_name,
    ]
      .map((value) => (value == null ? "" : String(value)))
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const handleSave = async () => {
    await fetchProducts();
    setOpen(false);
    setEditing(null);
  };

  const handleToggle = async (product) => {
    const next = product.is_active === 1 ? 0 : 1;
    setToggling((current) => new Set(current).add(product.id));
    try {
      await API.patch(`/admin/products/${product.id}`, { is_active: next });
      toast.success(`Product ${next === 1 ? "published" : "taken off the storefront"}`);
      await fetchProducts();
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to update stock status");
      await fetchProducts();
    } finally {
      setToggling((current) => {
        const nextSet = new Set(current);
        nextSet.delete(product.id);
        return nextSet;
      });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this product from the storefront? The row stays in the database.")) {
      return;
    }
    setDeleting(id);
    try {
      await API.delete(`/admin/products/${id}`);
      toast.success("Product removed from the storefront");
      await fetchProducts();
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to remove product");
    } finally {
      setDeleting(null);
    }
  };

  const coverImage = (product) =>
    Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : "/images/whey_isolate.jpg";

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900">
            {isArrivals ? "New Arrivals" : "Products"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArrivals
              ? "Products flagged as new arrivals. They show on the storefront home page."
              : "Every product in the catalog, active or not."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              data-testid="admin-product-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, brand, category"
              className="w-full pl-10 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="admin-refresh-products"
              onClick={fetchProducts}
              disabled={refreshing}
              className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              data-testid="admin-add-product"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-kinetic-red text-white text-sm font-bold hover:bg-red-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add product
            </button>
          </div>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <AnimatePresence>
          {loading ? (
            <div key="loading" data-testid="admin-products-loading" className="flex h-80 items-center justify-center text-slate-400 px-6">
              Loading products…
            </div>
          ) : (
            <div key="table">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-24">Cover</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Product</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-32">Category</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">MRP</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Sale</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-16">Discount</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-16">Stock</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-16">Badge</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-20">Status</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-400 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((product) => (
                    <tr
                      key={product.id}
                      data-testid={`admin-product-row-${product.id}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={coverImage(product)}
                            alt={product.name}
                            className="w-16 h-16 rounded-lg object-cover bg-slate-100"
                          />
                          <div className="flex flex-col">
                            <p className="font-semibold text-slate-900" data-testid={`admin-product-name-${product.id}`}>
                              {product.name}
                            </p>
                            {product.brand && (
                              <p className="text-xs text-slate-500" data-testid={`admin-product-brand-${product.id}`}>
                                {product.brand}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span data-testid={`admin-product-category-${product.id}`} className="text-slate-600">
                          {product.category_name || product.category || "—"}
                        </span>
                      </td>
                      <td className="p-4">
                        <span data-testid={`admin-product-mrp-${product.id}`}>{inr(product.mrp / 100)}</span>
                      </td>
                      <td className="p-4">
                        <span data-testid={`admin-product-sale-${product.id}`}>{inr(product.sale_price / 100)}</span>
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-product-discount-${product.id}`}
                          className="text-xs font-bold"
                        >
                          {product.discount_percent > 0 ? `${product.discount_percent}% OFF` : "—"}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-product-stock-${product.id}`}
                          className={`font-semibold ${
                            product.stock <= 10 ? "text-kinetic-red" : "text-slate-600"
                          }`}
                        >
                          {product.stock}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          data-testid={`admin-product-badge-${product.id}`}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                            BADGE_STYLES[product.badge] || BADGE_STYLES.none
                          }`}
                        >
                          {product.badge ?? "none"}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          data-testid={`admin-product-active-${product.id}`}
                          onClick={() => handleToggle(product)}
                          disabled={toggling.has(product.id)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                            product.is_active === 1 ? STATUS_COLORS.active : STATUS_COLORS.inactive
                          }`}
                        >
                          {product.is_active === 1 ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            data-testid={`admin-product-edit-${product.id}`}
                            onClick={() => {
                              setEditing(product);
                              setOpen(true);
                            }}
                            className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            data-testid={`admin-product-delete-${product.id}`}
                            onClick={() => handleDelete(product.id)}
                            disabled={deleting === product.id}
                            className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-kinetic-red disabled:opacity-50 transition-colors"
                            title="Remove from storefront"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-12 text-center">
                        <p className="text-slate-500">
                          {isArrivals ? "No new arrivals yet." : "No products found."}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </AnimatePresence>
      </div>

      {open && (
        <ProductForm
          product={editing}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
