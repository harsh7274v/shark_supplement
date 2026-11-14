import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { API, formatApiError, inr } from "../lib/api";
import { toast } from "sonner";
import { isJamshedpurOrSurrounding } from "../lib/location";

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);
const STORAGE_KEY = "kinetic_cart_v2"; // cart math now runs in integer paise

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [coupon, setCoupon] = useState(null);
  const [shippingLocation, setShippingLocation] = useState(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailOpts, setDetailOpts] = useState({});

  const openDetail = useCallback((product, opts = {}) => {
    setDetailProduct(product);
    setDetailOpts(opts);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailProduct(null);
    setDetailOpts({});
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((product, opts = {}) => {
    // The Worker API serves money in integer paise; the fallback catalogue
    // serves rupees. `sale_price` is present only on API-shaped products.
    const apiShape = product.sale_price != null;
    const price = apiShape
      ? Math.round(Number(product.sale_price))
      : Math.round(Number(product.price) * 100);
    const mrp = apiShape ? Math.round(Number(product.mrp)) : Math.round(Number(product.mrp) * 100);
    const flavor = opts.flavor ?? (product.flavors?.[0] || null);
    const weight = opts.weight ?? (product.weight_options?.[0] || null);
    const qty = opts.qty || 1;
    const key = `${product.id}|${flavor || ""}|${weight || ""}`;
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(next[idx].qty + qty, 20) };
        return next;
      }
      return [
        ...prev,
        {
          key,
          product: {
            id: product.id,
            name: product.name,
            brand: product.brand,
            price,
            mrp,
            image: product.images?.[0] ?? product.image,
            flavors: product.flavors || [],
            weight_options: product.weight_options || [],
            is_on_sale: product.is_on_sale,
            sale_percentage: product.sale_percentage,
            sale_ends_at: product.sale_ends_at,
          },
          flavor,
          weight,
          qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((key, qty) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) => (i.key === key ? { ...i, qty: Math.min(qty, 20) } : i))
    );
  }, []);

  const removeItem = useCallback((key) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const lastValidated = useRef({ code: null, subtotal: null, eligibleSubtotal: null });

  const clearCart = useCallback(() => {
    setItems([]);
    setCoupon(null);
    lastValidated.current = { code: null, subtotal: null, eligibleSubtotal: null };
  }, []);

  // Check if an item is a promotional sale product
  const isItemOnSale = useCallback((item) => {
    const p = item?.product;
    if (!p) return false;
    if (p.is_on_sale === 1 || p.is_on_sale === true) return true;
    if (p.sale_starts_at && p.sale_ends_at) {
      const now = Date.now();
      const s = new Date(p.sale_starts_at).getTime();
      const e = new Date(p.sale_ends_at).getTime();
      if (s <= now && now < e && ((p.sale_percentage ?? 0) > 0 || p.sale_price_override != null)) {
        return true;
      }
    }
    return false;
  }, []);

  // All cart math runs in integer paise; rupees only at display time.
  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const eligibleSubtotal = items
    .filter((i) => !isItemOnSale(i))
    .reduce((s, i) => s + i.product.price * i.qty, 0);
  const hasSaleItems = items.some((i) => isItemOnSale(i));

  const FREE_SHIP_PAISE = 99900; // ₹999
  const SHIPPING_PAISE = 7900; // ₹79

  const applyCoupon = useCallback(
    async (code, email) => {
      const trimmedCode = (code || "").trim().toUpperCase();
      if (!trimmedCode) {
        return { ok: false, error: "Please enter a coupon code." };
      }
      if (items.length === 0) {
        return { ok: false, error: "Your cart is empty. Add products before applying a coupon." };
      }
      if (eligibleSubtotal === 0) {
        setCoupon(null);
        return { ok: false, error: "Products currently on sale are not eligible for coupon discounts." };
      }
      try {
        const { data } = await API.post("/coupons/validate", {
          code: trimmedCode,
          subtotal,
          eligible_subtotal: eligibleSubtotal,
          email: email || undefined,
        });
        // The Worker answers HTTP 200 in both cases; validity is `data.valid`.
        if (!data.valid) {
          setCoupon(null);
          lastValidated.current = { code: null, subtotal: null, eligibleSubtotal: null };
          return { ok: false, error: data.detail || "This coupon is not valid for your cart." };
        }
        const newCoupon = {
          code: data.code,
          discount: data.discount,
          label: `−${inr(data.discount / 100)}`,
        };
        lastValidated.current = {
          code: data.code,
          subtotal,
          eligibleSubtotal,
        };
        setCoupon(newCoupon);
        return { ok: true, label: newCoupon.label };
      } catch (e) {
        setCoupon(null);
        lastValidated.current = { code: null, subtotal: null, eligibleSubtotal: null };
        return { ok: false, error: formatApiError(e) };
      }
    },
    [subtotal, eligibleSubtotal, items.length]
  );

  const removeCoupon = useCallback(() => {
    setCoupon(null);
    lastValidated.current = { code: null, subtotal: null, eligibleSubtotal: null };
  }, []);

  // Reactively revalidate and clean up active coupons whenever the cart items or subtotal change.
  useEffect(() => {
    if (!coupon) return;

    // Immediately drop coupon when cart is empty
    if (items.length === 0) {
      setCoupon(null);
      lastValidated.current = { code: null, subtotal: null, eligibleSubtotal: null };
      return;
    }

    // Immediately drop coupon if cart has only promotional sale items
    if (eligibleSubtotal === 0) {
      setCoupon(null);
      lastValidated.current = { code: null, subtotal: null, eligibleSubtotal: null };
      toast.warning("Coupon removed: Products on sale are not eligible for coupon discounts.");
      return;
    }

    // Skip redundant network check if amounts haven't changed since last validation
    if (
      lastValidated.current.code === coupon.code &&
      lastValidated.current.subtotal === subtotal &&
      lastValidated.current.eligibleSubtotal === eligibleSubtotal
    ) {
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const { data } = await API.post("/coupons/validate", {
          code: coupon.code,
          subtotal,
          eligible_subtotal: eligibleSubtotal,
        });
        if (cancelled) return;
        if (!data.valid) {
          setCoupon(null);
          lastValidated.current = { code: null, subtotal: null, eligibleSubtotal: null };
          toast.warning(data.detail || `Coupon ${coupon.code} removed (minimum cart requirement not met).`);
        } else {
          lastValidated.current = {
            code: data.code,
            subtotal,
            eligibleSubtotal,
          };
          if (data.discount !== coupon.discount) {
            setCoupon({ code: data.code, discount: data.discount, label: `−${inr(data.discount / 100)}` });
          }
        }
      } catch {
        // Do not drop coupon on transient network hiccup
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [items.length, subtotal, eligibleSubtotal, coupon]);

  // The cart keeps what the buyer picked; when a sale starts or an admin
  // edits prices, the stored prices of the lines stop being the truth. This
  // refreshes them from the catalog and drops a line whose option vanished.
  // It only mutates state if a price or option actually changed, avoiding render loops.
  const refreshCartPrices = useCallback(async () => {
    const currentItems = itemsRef.current;
    const ids = [...new Set(currentItems.map((i) => i.product?.id).filter(Boolean))];
    if (ids.length === 0) {
      return;
    }
    const updates = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      try {
        const { data } = await API.get("/products", { params: { ids: chunk.join(",") } });
        const list = Array.isArray(data) ? data : [];
        for (const product of list) {
          updates.set(product.id, product);
        }
      } catch {
        // One bad chunk leaves the rest of the cart on its stored price.
      }
    }
    setItems((prev) => {
      let changed = false;
      const next = [];
      for (const item of prev) {
        const served = updates.get(item.product?.id);
        // Fallback-shape lines (offline catalogue) carry no price maps: keep.
        if (!served || served.sale_price == null) {
          next.push(item);
          continue;
        }
        const price =
          served.size_prices?.[item.weight] ?? served.sale_price_effective ?? served.sale_price ?? item.product.price;
        const flavorOk = !item.flavor || (served.flavors || []).includes(item.flavor);
        const weightOk = !item.weight || (served.weight_options || []).includes(item.weight);
        if (!flavorOk || !weightOk) {
          toast.warning(`${item.product.name}: an option is no longer available`);
          changed = true;
          continue;
        }
        if (
          price !== item.product.price ||
          served.is_on_sale !== item.product.is_on_sale
        ) {
          changed = true;
          next.push({
            ...item,
            product: {
              ...item.product,
              price,
              is_on_sale: served.is_on_sale,
              sale_percentage: served.sale_percentage,
              sale_ends_at: served.sale_ends_at,
            },
          });
        } else {
          next.push(item);
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const isLocalJamshedpur = isJamshedpurOrSurrounding(shippingLocation);
  const discount = coupon ? Math.min(coupon.discount, eligibleSubtotal) : 0;
  const gst = items.length ? Math.round((subtotal - discount) * 0.05) : 0;
  const shipping = !items.length
    ? 0
    : isLocalJamshedpur || subtotal - discount >= FREE_SHIP_PAISE
    ? 0
    : SHIPPING_PAISE;
  const total = subtotal - discount + gst + shipping;

  const value = useMemo(
    () => ({
      items,
      cartOpen,
      setCartOpen,
      addItem,
      setQty,
      removeItem,
      clearCart,
      coupon,
      applyCoupon,
      removeCoupon,
      refreshCartPrices,
      subtotal,
      eligibleSubtotal,
      hasSaleItems,
      discount,
      gst,
      shipping,
      total,
      shippingLocation,
      setShippingLocation,
      isLocalJamshedpur,
      count: items.reduce((s, i) => s + i.qty, 0),
      detailProduct,
      detailOpts,
      openDetail,
      closeDetail,
    }),
    [
      items,
      cartOpen,
      coupon,
      shippingLocation,
      isLocalJamshedpur,
      detailProduct,
      detailOpts,
      openDetail,
      closeDetail,
      addItem,
      setQty,
      removeItem,
      clearCart,
      applyCoupon,
      removeCoupon,
      refreshCartPrices,
      subtotal,
      eligibleSubtotal,
      hasSaleItems,
      discount,
      gst,
      shipping,
      total,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

