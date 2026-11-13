import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, ShoppingBag, Zap, X } from "lucide-react";
import { toast } from "sonner";
import { inr } from "../lib/api";
import { useCart } from "../context/CartContext";

const EASE = [0.16, 1, 0.3, 1];

/** The id part of a chip: lowercase, non-alphanumerics folded into a dash. */
const chipSlug = (label) =>
  String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function ProductCard({ product, index = 0 }) {
  const { addItem, setCartOpen } = useCart();
  const [selSize, setSelSize] = useState(product.weight_options?.[0] ?? null);
  const [selFlavor, setSelFlavor] = useState(product.flavors?.[0] ?? null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // The Worker API serves money in integer paise and images as an array;
  // the fallback catalogue serves rupees with a singular `image`. Both
  // shapes show up (live API vs offline fallback), so normalize on read.
  const apiShape = product.sale_price != null;
  const salePrice = apiShape ? product.sale_price : product.price * 100;
  const mrpPrice = apiShape ? product.mrp : product.mrp * 100;
  const basePrice = apiShape ? product.sale_price : product.price * 100;
  const discount =
    product.discount_percent != null
      ? product.discount_percent
      : mrpPrice > 0
        ? Math.round((1 - salePrice / mrpPrice) * 100)
        : 0;

  const onSale = product.is_on_sale === 1;
  const showOffBadge = onSale || discount > 0;
  const offLabel = onSale ? `${product.sale_percentage}% OFF` : `${discount}% OFF`;
  const displayedPrice = selSize
    ? product.size_prices?.[selSize] ?? product.sale_price_effective ?? product.sale_price ?? salePrice
    : product.sale_price_effective ?? salePrice;
  const strikePrice = selSize
    ? product.size_prices_regular?.[selSize] ?? product.sale_price
    : product.sale_price ?? mrpPrice;

  const handleAdd = () => {
    addItem(product, { flavor: selFlavor, weight: selSize });
    toast.success(`${product.name} added to cart`, {
      description: "Open the cart panel to checkout",
      action: { label: "View Cart", onClick: () => setCartOpen(true) },
    });
  };

  const handleBuy = () => {
    addItem(product, { flavor: selFlavor, weight: selSize });
    setCartOpen(true);
  };

  const image =
    product.weight_images?.[selSize] ?? product.flavor_images?.[selFlavor] ?? product.images?.[0] ?? product.image;

  const details = () => setDetailsOpen(true);
  const closeDetails = () => setDetailsOpen(false);

  return (
    <motion.article
      data-testid={`product-card-${product.id}`}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, delay: (index % 4) * 0.08, ease: EASE }}
      whileHover={{ y: -6 }}
      className="group flex flex-col bg-white rounded-3xl border border-slate-100 overflow-hidden hover:shadow-[0_24px_50px_-24px_rgba(15,23,42,0.28)] transition-shadow duration-300"
    >
      <div className="relative aspect-square bg-slate-50 overflow-hidden">
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3.5 left-3.5 flex flex-col gap-1.5">
          {product.badge === "NEW" && (
            <span className="px-2.5 py-1 rounded-full bg-kinetic-ink text-white text-[10px] font-extrabold tracking-[0.14em] uppercase">
              New
            </span>
          )}
          {product.badge === "HOT" && (
            <span className="px-2.5 py-1 rounded-full bg-kinetic-red text-white text-[10px] font-extrabold tracking-[0.14em] uppercase flex items-center gap-1">
              <Zap className="w-3 h-3" /> Hot
            </span>
          )}
        </div>
        {showOffBadge && (
          <span className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-kinetic-orange text-xs font-extrabold">
            {offLabel}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-5 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase font-extrabold tracking-[0.22em] text-slate-400">
            {product.brand}
          </p>
          <span className="flex items-center gap-1 text-xs font-bold text-slate-700">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            {product.rating.toFixed(1)}
            {product.reviews_count != null && (
              <span className="text-slate-400 font-semibold">({product.reviews_count.toLocaleString("en-IN")})</span>
            )}
          </span>
        </div>
        <h3 className="font-display font-bold text-lg leading-snug text-slate-900 tracking-tight">
          {product.name}
        </h3>
        <div className="flex items-baseline gap-2 mt-auto pt-1.5">
          <span className="font-display font-black text-xl text-slate-900">{inr(displayedPrice / 100)}</span>
          {onSale && (
            <span className="text-sm text-slate-400 line-through font-semibold">{inr(strikePrice / 100)}</span>
          )}
          {!onSale && <span className="text-sm text-slate-400 line-through font-semibold">{inr(mrpPrice / 100)}</span>}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            data-testid={`details-btn-${product.id}`}
            type="button"
            onClick={details}
            className="text-sm font-extrabold text-kinetic-red hover:text-kinetic-orange transition-colors"
          >
            Details
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              data-testid={`add-to-cart-btn-${product.id}`}
              onClick={handleAdd}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-extrabold hover:border-kinetic-ink hover:bg-kinetic-ink hover:text-white transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              Add
            </button>
            <button
              data-testid={`buy-now-btn-${product.id}`}
              onClick={handleBuy}
              className="px-3 py-2.5 rounded-xl bg-kinetic-red text-white text-sm font-extrabold hover:bg-kinetic-orange transition-colors"
            >
              Buy Now
            </button>
          </div>
        </div>

        {product.weight_options?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2" data-testid={`size-chips-${product.id}`}>
            {product.weight_options.map((label) => (
              <button
                key={label}
                type="button"
                data-testid={`size-chip-${product.id}-${chipSlug(label)}`}
                onClick={() => setSelSize(label)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  selSize === label
                    ? "bg-kinetic-ink border-kinetic-ink text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:border-kinetic-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {product.flavors?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1" data-testid={`flavor-chips-${product.id}`}>
            {product.flavors.map((label) => (
              <button
                key={label}
                type="button"
                data-testid={`flavor-chip-${product.id}-${chipSlug(label)}`}
                onClick={() => setSelFlavor(label)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  selFlavor === label
                    ? "bg-kinetic-ink border-kinetic-ink text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:border-kinetic-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

      </div>

      <AnimatePresence>
        {detailsOpen && (
          <motion.div
            data-testid={`details-modal-${product.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-kinetic-ink/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
            onClick={closeDetails}
          >
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col"
              onClick={(event) => event.stopPropagation()}
              data-lenis-prevent
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <h3 className="font-display font-black text-xl text-slate-900">Product details</h3>
                <button
                  data-testid={`details-close-${product.id}`}
                  onClick={closeDetails}
                  className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                  aria-label="Close details"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>
              <div className="px-6 py-5 overflow-y-auto kinetic-scroll space-y-5">
                <h4 className="font-display font-bold text-lg text-slate-900">{product.name}</h4>
                <section className="space-y-2" data-testid="details-section-contents">
                  <h5 className="text-xs uppercase font-extrabold tracking-[0.22em] text-slate-400">
                    What&apos;s inside
                  </h5>
                  <p className="text-sm font-semibold text-slate-600" data-testid="details-contents">
                    {product.contents || "Not provided"}
                  </p>
                </section>
                <section className="space-y-2" data-testid="details-section-nutrition">
                  <h5 className="text-xs uppercase font-extrabold tracking-[0.22em] text-slate-400">
                    Nutrition
                  </h5>
                  <p className="text-sm font-semibold text-slate-600" data-testid="details-nutrition-value">
                    {product.nutrition || "Not provided"}
                  </p>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
