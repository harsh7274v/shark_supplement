import { useState } from "react";
import { motion } from "framer-motion";
import { Star, ShoppingBag, Zap } from "lucide-react";
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
  const { addItem, setCartOpen, openDetail } = useCart();
  const [selSize, setSelSize] = useState(product.weight_options?.[0] ?? null);
  const [selFlavor, setSelFlavor] = useState(product.flavors?.[0] ?? null);

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

  const openProductDrawer = () => {
    openDetail(product, { flavor: selFlavor, weight: selSize });
  };

  return (
    <motion.article
      data-testid={`product-card-${product.id}`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, delay: (index % 4) * 0.07, ease: EASE }}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={openProductDrawer}
      className="group flex flex-col h-full bg-white rounded-3xl border border-slate-100 overflow-hidden hover:shadow-[0_24px_50px_-24px_rgba(15,23,42,0.28)] transition-shadow duration-300 cursor-pointer"
    >
      <div className="relative aspect-square bg-slate-50 overflow-hidden">
        <img
          src={image}
          alt={product.name}
          decoding="async"
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

      <div className="flex flex-col p-5 flex-1">
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

        <h3 className="font-display font-bold text-base sm:text-lg leading-snug text-slate-900 tracking-tight line-clamp-2 min-h-[3rem] mt-1">
          {product.name}
        </h3>

        {/* Variants: Size and Flavor chips arranged cleanly */}
        {(product.weight_options?.length > 0 || product.flavors?.length > 0) && (
          <div className="flex flex-col gap-1.5 py-2">
            {product.weight_options?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" data-testid={`size-chips-${product.id}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 min-w-[38px]">
                  Size:
                </span>
                {product.weight_options.map((label) => (
                  <button
                    key={label}
                    type="button"
                    data-testid={`size-chip-${product.id}-${chipSlug(label)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelSize(label);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      selSize === label
                        ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {product.flavors?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" data-testid={`flavor-chips-${product.id}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 min-w-[38px]">
                  Flavor:
                </span>
                {product.flavors.map((label) => (
                  <button
                    key={label}
                    type="button"
                    data-testid={`flavor-chip-${product.id}-${chipSlug(label)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelFlavor(label);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      selFlavor === label
                        ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pricing */}
        <div className="flex items-baseline gap-2 pt-1 pb-3">
          <span className="font-display font-black text-xl text-slate-900">{inr(displayedPrice / 100)}</span>
          {onSale && (
            <span className="text-xs text-slate-400 line-through font-semibold">{inr(strikePrice / 100)}</span>
          )}
          {!onSale && mrpPrice > salePrice && (
            <span className="text-xs text-slate-400 line-through font-semibold">{inr(mrpPrice / 100)}</span>
          )}
        </div>

        {/* Action Buttons: perfectly aligned 3-button bottom toolbar */}
        <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-3 gap-1.5 sm:gap-2">
          <button
            data-testid={`details-btn-${product.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openProductDrawer();
            }}
            className="h-10 flex items-center justify-center px-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-extrabold transition-all"
          >
            Details
          </button>
          <button
            data-testid={`add-to-cart-btn-${product.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAdd();
            }}
            className="h-10 flex items-center justify-center gap-1.5 px-2 rounded-xl border-2 border-slate-200 bg-white text-slate-900 text-xs font-extrabold hover:border-slate-900 hover:bg-slate-900 hover:text-white transition-all"
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            Add
          </button>
          <button
            data-testid={`buy-now-btn-${product.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleBuy();
            }}
            className="h-10 flex items-center justify-center px-2 rounded-xl bg-kinetic-red text-white text-xs font-extrabold hover:bg-kinetic-orange transition-all shadow-sm"
          >
            Buy Now
          </button>
        </div>

      </div>
    </motion.article>
  );
}
