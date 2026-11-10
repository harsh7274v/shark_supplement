import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { API, formatApiError } from "../lib/api";

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);
const STORAGE_KEY = "kinetic_cart_v1";

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
            price: product.price,
            mrp: product.mrp,
            image: product.image,
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

  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);

  const applyCoupon = useCallback(
    async (code) => {
      try {
        const { data } = await API.post("/coupons/validate", { code, subtotal });
        setCoupon({ code: data.code, discount: data.discount, label: data.label });
        return { ok: true, label: data.label };
      } catch (e) {
        setCoupon(null);
        return { ok: false, error: formatApiError(e) };
      }
    },
    [subtotal]
  );

  const removeCoupon = useCallback(() => setCoupon(null), []);

  const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
  const gst = items.length ? Math.round((subtotal - discount) * 0.05) : 0;
  const shipping = !items.length ? 0 : subtotal - discount >= 999 ? 0 : 79;
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
      subtotal,
      discount,
      gst,
      shipping,
      total,
      count: items.reduce((s, i) => s + i.qty, 0),
    }),
    [items, cartOpen, coupon, addItem, setQty, removeItem, clearCart, applyCoupon, removeCoupon, subtotal, discount, gst, shipping, total]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

