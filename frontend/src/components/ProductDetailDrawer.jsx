import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Star, ShoppingBag, Zap, ShieldCheck, Truck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { inr } from "../lib/api";
import { useCart } from "../context/CartContext";

const EASE = [0.16, 1, 0.3, 1];

const chipSlug = (label) =>
  String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function ProductDetailDrawer() {
  const { detailProduct, detailOpts, closeDetail, addItem, setCartOpen } = useCart();
  const [selSize, setSelSize] = useState(null);
  const [selFlavor, setSelFlavor] = useState(null);
  const [activeImage, setActiveImage] = useState(null);
  const [qty, setQty] = useState(1);

  // Sync state whenever a new product is selected
  useEffect(() => {
    if (detailProduct) {
      setSelSize(detailOpts?.weight ?? detailProduct.weight_options?.[0] ?? null);
      setSelFlavor(detailOpts?.flavor ?? detailProduct.flavors?.[0] ?? null);
      setActiveImage(null);
      setQty(1);
    }
  }, [detailProduct, detailOpts]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && detailProduct) {
        closeDetail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailProduct, closeDetail]);

  if (!detailProduct) return null;

  const product = detailProduct;

  const apiShape = product.sale_price != null;
  const salePrice = apiShape ? product.sale_price : product.price * 100;
  const mrpPrice = apiShape ? product.mrp : product.mrp * 100;
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

  // Resolve current active image
  const variantImage =
    product.weight_images?.[selSize] ??
    product.flavor_images?.[selFlavor] ??
    product.images?.[0] ??
    product.image ??
    "/api/images/catalog/whey_isolate.jpg";

  const displayImage = activeImage || variantImage;

  // Collect all gallery images
  const allImages = Array.from(
    new Set([
      ...(Array.isArray(product.images) ? product.images : []),
      product.image,
      ...Object.values(product.weight_images || {}),
      ...Object.values(product.flavor_images || {}),
    ].filter((val) => typeof val === "string" && val.length > 0))
  );

  const handleAddToCart = () => {
    addItem(product, { flavor: selFlavor, weight: selSize, qty });
    toast.success(`${product.name} added to cart`, {
      description: `${qty}x · ${[selFlavor, selSize].filter(Boolean).join(" · ") || "Standard"}`,
      action: {
        label: "View Cart",
        onClick: () => {
          closeDetail();
          setCartOpen(true);
        },
      },
    });
  };

  const handleBuyNow = () => {
    addItem(product, { flavor: selFlavor, weight: selSize, qty });
    closeDetail();
    setCartOpen(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="product-drawer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={closeDetail}
        className="fixed inset-0 z-[60] bg-kinetic-ink/45 backdrop-blur-sm"
        data-testid="product-detail-drawer-overlay"
      />
      <motion.aside
        key="product-drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.4, ease: EASE }}
        className="fixed top-0 right-0 z-[70] h-full w-full max-w-md sm:max-w-lg bg-white shadow-2xl flex flex-col"
        data-testid="product-detail-drawer"
        data-testid-product={`details-drawer-${product.id}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <p className="text-[10px] uppercase font-extrabold tracking-[0.25em] text-kinetic-red">
              Product Overview
            </p>
            <h2 className="font-display font-black text-xl text-slate-900 mt-0.5">
              {product.brand || "TOM NUTRITION"}
            </h2>
          </div>
          <button
            data-testid={`details-close-${product.id}`}
            onClick={closeDetail}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Close product details"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto kinetic-scroll px-6 py-5 space-y-6" data-lenis-prevent>
          {/* Main Image with Badges */}
          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-50 border border-slate-100">
            <img
              src={displayImage}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-300"
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
              <span className="absolute top-3.5 right-3.5 px-3 py-1 rounded-full bg-white/95 backdrop-blur text-kinetic-orange text-xs font-black shadow-sm">
                {offLabel}
              </span>
            )}
          </div>

          {/* Gallery Thumbnails (if multiple images available) */}
          {allImages.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 kinetic-scroll">
              {allImages.map((imgUrl, idx) => (
                <button
                  key={`${imgUrl}-${idx}`}
                  type="button"
                  onClick={() => setActiveImage(imgUrl)}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 ${
                    displayImage === imgUrl ? "border-kinetic-red ring-2 ring-kinetic-red/20" : "border-slate-200 opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Title & Ratings */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                In Stock
              </span>
              <span className="flex items-center gap-1 text-sm font-bold text-slate-700">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                {product.rating ? product.rating.toFixed(1) : "4.8"}
                {product.reviews_count != null && (
                  <span className="text-slate-400 font-semibold">({product.reviews_count.toLocaleString("en-IN")} reviews)</span>
                )}
              </span>
            </div>
            <h3 className="font-display font-black text-2xl text-slate-900 leading-tight">
              {product.name}
            </h3>
          </div>

          {/* Pricing */}
          <div className="flex items-baseline gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="font-display font-black text-3xl text-slate-900">
              {inr(displayedPrice / 100)}
            </span>
            {(onSale || strikePrice > displayedPrice) && (
              <span className="text-base text-slate-400 line-through font-semibold">
                {inr(strikePrice / 100)}
              </span>
            )}
            {showOffBadge && (
              <span className="ml-auto px-2.5 py-1 rounded-lg bg-kinetic-orange/10 text-kinetic-orange text-xs font-black">
                Save {offLabel}
              </span>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div className="space-y-1.5">
              <h4 className="text-xs uppercase font-extrabold tracking-[0.22em] text-slate-400">
                Description
              </h4>
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                {product.description}
              </p>
            </div>
          )}

          {/* Size / Weight Options */}
          {Array.isArray(product.weight_options) && product.weight_options.length > 0 && (
            <div className="space-y-2" data-testid={`size-chips-${product.id}`}>
              <h4 className="text-xs uppercase font-extrabold tracking-[0.22em] text-slate-400">
                Select Size / Weight
              </h4>
              <div className="flex flex-wrap gap-2">
                {product.weight_options.map((label) => (
                  <button
                    key={label}
                    type="button"
                    data-testid={`size-chip-${product.id}-${chipSlug(label)}`}
                    onClick={() => {
                      setSelSize(label);
                      setActiveImage(null);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                      selSize === label
                        ? "bg-kinetic-ink border-kinetic-ink text-white shadow-sm"
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Flavor Options */}
          {Array.isArray(product.flavors) && product.flavors.length > 0 && (
            <div className="space-y-2" data-testid={`flavor-chips-${product.id}`}>
              <h4 className="text-xs uppercase font-extrabold tracking-[0.22em] text-slate-400">
                Select Flavor
              </h4>
              <div className="flex flex-wrap gap-2">
                {product.flavors.map((label) => (
                  <button
                    key={label}
                    type="button"
                    data-testid={`flavor-chip-${product.id}-${chipSlug(label)}`}
                    onClick={() => {
                      setSelFlavor(label);
                      setActiveImage(null);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                      selFlavor === label
                        ? "bg-kinetic-ink border-kinetic-ink text-white shadow-sm"
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* What's Inside & Nutrition */}
          {(product.contents || product.nutrition) && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              {product.contents && (
                <div className="space-y-1.5" data-testid="details-section-contents">
                  <h4 className="text-xs uppercase font-extrabold tracking-[0.22em] text-slate-400">
                    What&apos;s inside
                  </h4>
                  <p className="text-sm font-semibold text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-100" data-testid="details-contents">
                    {product.contents}
                  </p>
                </div>
              )}
              {product.nutrition && (
                <div className="space-y-1.5" data-testid="details-section-nutrition">
                  <h4 className="text-xs uppercase font-extrabold tracking-[0.22em] text-slate-400">
                    Nutrition
                  </h4>
                  <p className="text-sm font-semibold text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-100" data-testid="details-nutrition-value">
                    {product.nutrition}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Trust Highlights */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
            <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-slate-50">
              <ShieldCheck className="w-4 h-4 text-kinetic-red" />
              <span className="text-[11px] font-bold text-slate-700">100% Authentic</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-slate-50">
              <Truck className="w-4 h-4 text-kinetic-red" />
              <span className="text-[11px] font-bold text-slate-700">Fast Delivery</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-slate-50">
              <RotateCcw className="w-4 h-4 text-kinetic-red" />
              <span className="text-[11px] font-bold text-slate-700">Easy Returns</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 bg-white space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Quantity
            </span>
            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors font-black text-base"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-black text-slate-900">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors font-black text-base"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              data-testid={`details-add-to-cart-${product.id}`}
              onClick={handleAddToCart}
              className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl border-2 border-slate-900 bg-white text-slate-900 font-extrabold text-sm hover:bg-slate-900 hover:text-white transition-all duration-200"
            >
              <ShoppingBag className="w-4 h-4" />
              Add to Cart
            </button>
            <button
              type="button"
              data-testid={`details-buy-now-${product.id}`}
              onClick={handleBuyNow}
              className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-all duration-200 shadow-md shadow-kinetic-red/20"
            >
              Buy Now
            </button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
