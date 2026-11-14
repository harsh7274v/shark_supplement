import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Tag } from "lucide-react";
import { API, fmtIst } from "../lib/api";
import ProductCard from "./ProductCard";

const EASE = [0.16, 1, 0.3, 1];

function dedupeById(list) {
  const seen = new Set();
  return list.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function SaleSection({ onProductsLoaded }) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let alive = true;
    // The admin's sale writes land here: on_sale=1 with the newest window.
    API.get("/products", { params: { on_sale: "1", sort: "newest", limit: 8 } })
      .then((r) => {
        if (alive && Array.isArray(r.data)) {
          const clean = dedupeById(r.data);
          setProducts(clean);
          onProductsLoaded?.(clean);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onProductsLoaded]);

  if (products.length === 0) {
    return null;
  }

  return (
    <section id="sale" className="py-20 lg:py-24" data-testid="sale-section">
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
              <Tag className="w-4 h-4" /> Going Fast
            </p>
            <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tight text-slate-900">
              Sale
            </h2>
          </div>
          <p className="text-sm font-semibold text-slate-500 max-w-xs text-right hidden sm:block">
            The formulas everyone is grabbing before the kettle cools.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="sale-grid">
          {products.map((p, i) => (
            <div key={p.id} className="space-y-2">
              <ProductCard product={p} index={i} />
              <span data-testid={`sale-ends-${p.id}`} className="text-xs font-bold text-slate-400">
                {fmtIst(p.sale_ends_at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
