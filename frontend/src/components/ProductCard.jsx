import { motion } from "framer-motion";
import { Star, ShoppingBag, Zap } from "lucide-react";
import { toast } from "sonner";
import { inr } from "../lib/api";
import { useCart } from "../context/CartContext";

const EASE = [0.16, 1, 0.3, 1];

export default function ProductCard({ product, index = 0 }) {
  const { addItem, setCartOpen } = useCart();
  // The Worker API serves money in integer paise and images as an array;
  // the fallback catalogue serves rupees with a singular `image`. Both
  // shapes show up (live API vs offline fallback), so normalize on read.
  const apiShape = product.sale_price != null;
  const salePrice = apiShape ? product.sale_price : product.price * 100;
  const mrpPrice = apiShape ? product.mrp : product.mrp * 100;
  const discount =
    product.discount_percent != null
      ? product.discount_percent
      : mrpPrice > 0
        ? Math.round((1 - salePrice / mrpPrice) * 100)
        : 0;

  const handleAdd = () => {
    addItem(product);
    toast.success(`${product.name} added to cart`, {
      description: "Open the cart panel to checkout",
      action: { label: "View Cart", onClick: () => setCartOpen(true) },
    });
  };

  const handleBuy = () => {
    addItem(product);
    setCartOpen(true);
  };

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
          src={product.images?.[0] ?? product.image}
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
        {discount > 0 && (
          <span className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-kinetic-orange text-xs font-extrabold">
            {discount}% OFF
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
          <span className="font-display font-black text-xl text-slate-900">{inr(salePrice / 100)}</span>
          <span className="text-sm text-slate-400 line-through font-semibold">{inr(mrpPrice / 100)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
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
    </motion.article>
  );
}

