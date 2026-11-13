import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { API, formatApiError, inr } from "../lib/api";
import { toast } from "sonner";

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

  const clearCart = useCallback(() => {
    setItems([]);
    setCoupon(null);
  }, []);

  // All cart math runs in integer paise; rupees only at display time.
  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);

  const FREE_SHIP_PAISE = 99900; // ₹999
  const SHIPPING_PAISE = 7900; // ₹79

  const applyCoupon = useCallback(
    async (code) => {
      try {
        const { data } = await API.post("/coupons/validate", { code, subtotal });
        // The Worker answers HTTP 200 in both cases; validity is `data.valid`.
        if (!data.valid) {
          setCoupon(null);
          return { ok: false, error: "This coupon is not valid for your cart." };
        }
        setCoupon({ code: data.code, discount: data.discount, label: `−${inr(data.discount / 100)}` });
        return { ok: true, label: `−${inr(data.discount / 100)}` };
      } catch (e) {
        setCoupon(null);
        return { ok: false, error: formatApiError(e) };
      }
    },
    [subtotal]
  );

  const removeCoupon = useCallback(() => setCoupon(null), []);

  // The cart keeps what the buyer picked; when a sale starts or an admin
  // edits prices, the stored prices of the lines stop being the truth. This
  // refreshes them from the catalog and drops a line whose option vanished.
  const refreshCartPrices = useCallback(async () => {
    const ids = [...new Set(items.map((i) => i.product?.id).filter(Boolean))];
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
    const next = [];
    for (const item of items) {
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
        continue;
      }
      next.push({ ...item, product: { ...item.product, price } });
    }
    setItems(next);
  }, [items]);

  const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
  const gst = items.length ? Math.round((subtotal - discount) * 0.05) : 0;
  const shipping = !items.length ? 0 : subtotal - discount >= FREE_SHIP_PAISE ? 0 : SHIPPING_PAISE;
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
      discount,
      gst,
      shipping,
      total,
      count: items.reduce((s, i) => s + i.qty, 0),
    }),
    [
      items,
      cartOpen,
      coupon,
      addItem,
      setQty,
      removeItem,
      clearCart,
      applyCoupon,
      removeCoupon,
      refreshCartPrices,
      subtotal,
      discount,
      gst,
      shipping,
      total,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

