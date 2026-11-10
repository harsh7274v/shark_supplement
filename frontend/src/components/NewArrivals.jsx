import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { API } from "../lib/api";
import { DEFAULT_PRODUCTS } from "../data/defaultCatalog";
import ProductCard from "./ProductCard";

const EASE = [0.16, 1, 0.3, 1];

export default function NewArrivals() {
  const [products, setProducts] = useState(() =>
    DEFAULT_PRODUCTS.filter((p) => p.badge === "NEW").slice(0, 4)
  );

  useEffect(() => {
    let alive = true;
    API.get("/products", { params: { new_arrivals: "1", limit: 4 } })
      .then((r) => {
        if (alive && Array.isArray(r.data)) {
          setProducts(r.data);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <section id="new-arrivals" className="py-20 lg:py-24" data-testid="new-arrivals-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-wrap items-end justify-between gap-4 mb-10"
        >
          <div>
            <p className="text-xs uppercase font-extrabold tracking-[0.28em] text-kinetic-red mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Just Landed
            </p>
            <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tight text-slate-900">
              New Arrivals
            </h2>
          </div>
          <p className="text-sm font-semibold text-slate-500 max-w-xs text-right hidden sm:block">
            The freshest formulas to hit our shelves — restocked weekly.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="new-arrivals-grid">
          {products.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
        {products.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex justify-center mt-10"
          >
            <button
              data-testid="new-arrivals-view-all-btn"
              onClick={() => {
                document.querySelector('[data-testid="shop-filter-chip-all"]')?.click();
                const shop = document.getElementById("shop");
                if (window.__lenis && shop) window.__lenis.scrollTo(shop, { offset: -76 });
                else shop?.scrollIntoView({ behavior: "smooth" });
              }}
              className="group flex items-center gap-2 px-7 py-3.5 rounded-full bg-kinetic-ink text-white font-extrabold text-sm hover:bg-slate-800 transition-colors"
            >
              View the full arsenal
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        )}
      </div>
    </section>
  );
}
