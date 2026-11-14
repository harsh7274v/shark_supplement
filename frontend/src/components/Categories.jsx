import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1];

export const CATEGORY_FALLBACK_IMAGES = {
  proteins: "/api/images/catalog/category_proteins.jpg",
  gainers: "/api/images/catalog/category_gainers.jpg",
  pre_post: "/api/images/catalog/category_pre_post.jpg",
  "pre-post": "/api/images/catalog/category_pre_post.jpg",
  ayurveda: "/api/images/catalog/category_ayurveda.jpg",
  fit_foods: "/api/images/catalog/category_fit_foods.jpg",
  "fit-foods": "/api/images/catalog/category_fit_foods.jpg",
  vitamins: "/api/images/catalog/category_vitamins.jpg",
  fat_loss: "/api/images/catalog/category_fat_loss.jpg",
  "fat-loss": "/api/images/catalog/category_fat_loss.jpg",
  apparel: "/api/images/catalog/category_apparel.jpg",
  aminos: "/api/images/catalog/category_aminos.jpg",
  "gym-gear": "/api/images/catalog/category_gym_gear.jpg",
  gym_gear: "/api/images/catalog/category_gym_gear.jpg",
};

export function resolveCategoryImage(cat) {
  if (!cat) return "/api/images/catalog/category_proteins.jpg";
  const url = cat.image_url || cat.image;
  if (url && !url.includes("/seed/")) {
    return url;
  }
  return CATEGORY_FALLBACK_IMAGES[cat.slug] || "/api/images/catalog/category_proteins.jpg";
}

export default function Categories({ categories, activeCategory, onNavCategory }) {
  return (
    <section id="categories" className="py-20 lg:py-24" data-testid="categories-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <p className="text-xs uppercase font-extrabold tracking-[0.28em] text-kinetic-red mb-3">
              Shop by Goal
            </p>
            <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tight text-slate-900">
              All Categories
            </h2>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            onClick={() => onNavCategory("all")}
            data-testid="view-all-categories-btn"
            className="hidden sm:flex items-center gap-1.5 text-sm font-extrabold text-slate-900 hover:text-kinetic-red transition-colors"
          >
            View all <ArrowUpRight className="w-4 h-4" />
          </motion.button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-10 gap-x-4 gap-y-8 sm:gap-x-6">
          {categories.map((cat, i) => {
            const active = activeCategory === cat.slug;
            return (
              <motion.button
                key={cat.slug}
                data-testid={`category-circle-${cat.slug}`}
                onClick={() => onNavCategory(cat.slug)}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.55, delay: i * 0.07, ease: EASE }}
                whileHover={{ scale: 1.06, y: -4 }}
                whileTap={{ scale: 0.97 }}
                className="group flex flex-col items-center gap-3 text-center"
              >
                <span
                  className={`relative block w-full max-w-[128px] aspect-square rounded-full overflow-hidden ring-2 transition-shadow duration-300 ${
                    active
                      ? "ring-kinetic-red shadow-[0_0_0_6px_rgba(255,59,48,0.15)]"
                      : "ring-slate-100 group-hover:ring-kinetic-orange group-hover:shadow-[0_0_0_6px_rgba(255,107,0,0.12)]"
                  }`}
                >
                  <img
                    src={resolveCategoryImage(cat)}
                    alt={cat.name}
                    loading="lazy"
                    onError={(e) => {
                      const fallback = CATEGORY_FALLBACK_IMAGES[cat.slug] || "/api/images/catalog/whey_isolate.jpg";
                      if (e.currentTarget.src !== fallback && !e.currentTarget.src.endsWith(fallback)) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                    className="w-full h-full object-cover group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500"
                  />
                  {active && (
                    <motion.span
                      layoutId="category-active-dot"
                      className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-kinetic-red ring-2 ring-white"
                    />
                  )}
                </span>
                <span className="flex flex-col">
                  <span
                    className={`font-display font-bold text-sm sm:text-[15px] leading-tight transition-colors ${
                      active ? "text-kinetic-red" : "text-slate-900 group-hover:text-kinetic-red"
                    }`}
                  >
                    {cat.name}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold mt-0.5">
                    {cat.product_count ?? cat.count ?? 0} products
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

