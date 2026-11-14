import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { API } from "../lib/api";
import { DEFAULT_PRODUCTS } from "../data/defaultCatalog";
import ProductCard from "./ProductCard";

const EASE = [0.16, 1, 0.3, 1];

export const SORT_OPTIONS = [
  { value: "most_ordered", label: "Most Ordered" },
  { value: "top_rated", label: "Top Rated" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest First" },
];

export function SortDropdown({ sort, onSort }) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.value === sort);
  return (
    <div className="relative">
      <button
        data-testid="sort-select-dropdown"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full border-2 border-slate-200 bg-white text-sm font-extrabold text-slate-800 hover:border-slate-900 transition-colors"
      >
        <ArrowUpDown className="w-4 h-4 text-kinetic-red" />
        {current?.label}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 z-30 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5"
            data-testid="sort-dropdown-menu"
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-testid={`sort-option-${opt.value}`}
                onClick={() => { onSort(opt.value); setOpen(false); }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-bold text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {opt.label}
                {sort === opt.value && <Check className="w-4 h-4 text-kinetic-red" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function dedupeById(list) {
  const seen = new Set();
  return list.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

const getInitialShopProducts = (exclude = []) => {
  const sorted = [...DEFAULT_PRODUCTS].sort((a, b) => (b.orders_count || 0) - (a.orders_count || 0));
  const filtered = sorted.filter((p) => !exclude.includes(p.id) && p.badge !== "NEW");
  return dedupeById(filtered.length > 0 ? filtered : sorted);
};

export default function ShopSection({ categories, activeCategory, onNavCategory, excludeIds = [] }) {
  const [sort, setSort] = useState("most_ordered");
  const [products, setProducts] = useState(() => getInitialShopProducts(excludeIds));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // When showing 'all', ask for up to 16 products so that excluding the ones
    // in New Arrivals / Sale still leaves plenty to fill the 8-card grid.
    const isAll = !activeCategory || activeCategory === "all";
    const params = { sort, limit: isAll ? 16 : 8 };
    if (!isAll) params.category = activeCategory;

    const fallbackFilter = () => {
      let list = [...DEFAULT_PRODUCTS];
      if (!isAll) {
        list = list.filter((p) => p.category === activeCategory);
      } else if (excludeIds.length > 0) {
        list = list.filter((p) => !excludeIds.includes(p.id));
      }
      if (sort === "price_asc") list.sort((a, b) => a.price - b.price);
      else if (sort === "price_desc") list.sort((a, b) => b.price - a.price);
      else if (sort === "top_rated") list.sort((a, b) => b.rating - a.rating);
      else list.sort((a, b) => b.orders_count - a.orders_count);
      return dedupeById(list);
    };

    API.get("/products", { params })
      .then((r) => {
        if (alive && Array.isArray(r.data)) {
          setProducts(dedupeById(r.data));
        } else if (alive) {
          setProducts([]);
        }
      })
      .catch(() => {
        if (alive) {
          setProducts([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [activeCategory, sort]);

  const title = !activeCategory || activeCategory === "all"
    ? "Best Sellers"
    : categories.find((c) => c.slug === activeCategory)?.name || "Products";

  const isAll = !activeCategory || activeCategory === "all";
  const unexcluded = isAll && excludeIds.length > 0
    ? products.filter((p) => !excludeIds.includes(p.id))
    : products;
  const displayProducts = (unexcluded.length > 0 ? unexcluded : products).slice(0, 8);

  return (
    <section id="shop" className="py-20 lg:py-24 bg-slate-50/70 border-y border-slate-100" data-testid="shop-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-wrap items-end justify-between gap-6 mb-8"
        >
          <div>
            <p className="text-xs uppercase font-extrabold tracking-[0.28em] text-kinetic-red mb-3">
              The Full Arsenal
            </p>
            <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tight text-slate-900" data-testid="shop-section-title">
              {title}
            </h2>
          </div>
          <SortDropdown sort={sort} onSort={setSort} />
        </motion.div>

        <div className="flex gap-2 overflow-x-auto kinetic-scroll pb-2 mb-8 -mx-1 px-1">
          {[{ slug: "all", name: "All" }, ...categories].map((c) => {
            const active = (activeCategory || "all") === c.slug;
            return (
              <button
                key={c.slug}
                data-testid={`shop-filter-chip-${c.slug}`}
                onClick={() => onNavCategory(c.slug)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-extrabold transition-colors ${
                  active
                    ? "bg-kinetic-ink text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        {loading && products.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="shop-loading-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-3xl bg-white border border-slate-100 overflow-hidden">
                <div className="aspect-square bg-slate-100 animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-1/3 bg-slate-100 rounded-full animate-pulse" />
                  <div className="h-4 w-3/4 bg-slate-100 rounded-full animate-pulse" />
                  <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-display font-bold text-xl text-slate-900">No products here yet</p>
            <p className="text-slate-500 mt-1">Try another category — new stock drops every week.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="shop-grid">
            {displayProducts.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
