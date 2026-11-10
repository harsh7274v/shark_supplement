import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Image as ImageIcon } from "lucide-react";
import { API, toPaise, formatApiError } from "../../lib/api";
import { toast } from "sonner";

/** Badge values the admin writes: canonical uppercase per the storefront comparison. */
const BADGE_OPTIONS = [
  { value: "none", label: "No badge" },
  { value: "NEW", label: "New" },
  { value: "HOT", label: "Hot" },
];

const blankForm = () => ({
  name: "",
  brand: "",
  description: "",
  category_id: "",
  mrp: "",
  sale: "",
  stock: "",
  flavors: "",
  weights: "",
  badge: "none",
  isNewArrival: false,
  isActive: true,
  images: [],
});

/** Turns a product served by the API into the form's local state. */
const loadForm = (product) => ({
  name: product.name ?? "",
  brand: product.brand ?? "",
  description: product.description ?? "",
  category_id: product.category_id ?? "",
  mrp: product.mrp != null ? String(product.mrp / 100) : "",
  sale: product.sale_price != null ? String(product.sale_price / 100) : "",
  stock: product.stock != null ? String(product.stock) : "",
  flavors: Array.isArray(product.flavors) ? product.flavors.join(", ") : "",
  weights: Array.isArray(product.weight_options) ? product.weight_options.join(", ") : "",
  badge: product.badge ?? "none",
  isNewArrival: product.is_new_arrival === 1,
  isActive: product.is_active === 1,
  images: Array.isArray(product.images) ? [...product.images] : [],
});

export default function ProductForm({ product: initialProduct, onSave, onClose }) {
  const [mode, setMode] = useState(initialProduct ? "edit" : "create");
  const [item, setItem] = useState(initialProduct ?? null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [errors, setErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [discount, setDiscount] = useState(0);

  // ---------- bootstrap ----------
  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      await fetchCategories();
      const product = initialProduct ?? null;
      if (product) {
        setMode("edit");
        setItem(product);
        setForm(loadForm(product));
      } else {
        setMode("create");
        setItem(null);
        setForm(blankForm());
      }
    };
    bootstrap();
    return () => {
      alive = false;
    };
  }, [initialProduct]);

  // ---------- live discount % (Global-Constraint formula: round((mrp - sale) / mrp * 100)) ----------
  useEffect(() => {
    const mrp = Number(form.mrp);
    const sale = Number(form.sale);
    setDiscount(mrp > 0 ? Math.max(0, Math.round(((mrp - sale) / mrp) * 100)) : 0);
  }, [form.mrp, form.sale]);

  const fetchCategories = useCallback(async () => {
    setCatsLoading(true);
    try {
      const { data } = await API.get("/admin/categories");
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      // Categories are optional: never block the product form.
    } finally {
      setCatsLoading(false);
    }
  }, []);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      }
      return next;
    });
  };

  const toggleField = (key) => setField(key, !form[key]);

  const validate = () => {
    const next = {};
    if (!form.name.trim()) {
      next.name = "Name is required";
    }
    const mrp = Number(form.mrp);
    const sale = Number(form.sale);
    if (!Number.isFinite(mrp) || mrp <= 0) {
      next.mrp = "MRP must be greater than 0";
    }
    const saleValid = Number.isFinite(sale) && sale > 0;
    if (!saleValid) {
      next.sale = "Sale price must be greater than 0";
    } else if (Number.isFinite(mrp) && sale > mrp) {
      next.sale = "Sale price must be ≤ MRP";
    }
    const stock = Number(form.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      next.stock = "Stock must be ≥ 0";
    }
    setErrors(next);
    return Object.keys(next).length > 0;
  };

  const handleFiles = (files) => {
    Array.from(files).forEach((file) => {
      if (!file.type || !file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image`);
        return;
      }
      const data = new FormData();
      data.append("file", file);
      API.post("/admin/uploads", data)
        .then((response) => {
          const url = response.data?.url;
          if (!url) return;
          setForm((prev) => ({ ...prev, images: [...prev.images, url] }));
        })
        .catch((uploadError) => {
          toast.error(formatApiError(uploadError) || "Image upload failed");
        });
    });
  };

  const promoteImage = (index) => {
    if (index === 0) return;
    setForm((prev) => {
      const next = { ...prev };
      const images = [...prev.images];
      const [moved] = images.splice(index, 1);
      images.unshift(moved);
      next.images = images;
      return next;
    });
  };

  const removeImage = (index) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (validate()) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        brand: form.brand,
        description: form.description,
        category_id: form.category_id || undefined,
        mrp: toPaise(form.mrp),
        sale_price: toPaise(form.sale),
        stock: form.stock === "" ? 0 : Number(form.stock),
        images: form.images,
        flavors: form.flavors.split(",").map((value) => value.trim()).filter(Boolean),
        weight_options: form.weights.split(",").map((value) => value.trim()).filter(Boolean),
        badge: form.badge,
        is_new_arrival: form.isNewArrival ? 1 : 0,
        is_active: form.isActive ? 1 : 0,
      };
      if (mode === "edit") {
        await API.patch(`/admin/products/${item.id}`, payload);
        toast.success("Product updated");
      } else {
        await API.post("/admin/products", payload);
        toast.success("Product created");
      }
      onSave?.();
      onClose?.();
    } catch (error) {
      toast.error(formatApiError(error) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const chip = (value, label, selected) => (
    <button
      key={value}
      data-testid={`admin-product-chip-${value}`}
      onClick={() => setField("category_id", value)}
      className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
        selected
          ? "bg-kinetic-red border-kinetic-red text-white"
          : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="absolute top-10 sm:top-6 left-4 sm:left-[10%] w-full sm:w-[80%] max-w-5xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-xl text-slate-900">
            {mode === "edit" ? "Edit product" : "Add product"}
          </h2>
          <button data-testid="admin-product-form-close" onClick={onClose} className="text-slate-400 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Images: dropzone + preview grid */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Product images</h3>
                <span className="text-xs text-slate-400">PNG, JPG, WEBP up to 10 MB</span>
              </div>
              <div
                data-testid="admin-product-image-input"
                onDrop={(event) => {
                  event.preventDefault();
                  handleFiles(event.dataTransfer.files);
                }}
                onDragOver={(event) => event.preventDefault()}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-kinetic-red hover:text-kinetic-red transition-colors cursor-pointer"
              >
                <ImageIcon className="w-6 h-6" />
                <p className="text-sm">Drag &amp; drop images, or click to browse</p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleFiles(event.target.files)}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                {form.images.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    data-testid={`admin-product-image-preview-${index}`}
                    onClick={() => promoteImage(index)}
                    className="relative group w-24 h-24 shrink-0 cursor-pointer"
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full rounded-xl object-cover border border-slate-200 group-hover:border-kinetic-red transition-colors"
                    />
                    {index === 0 && (
                      <span className="absolute top-1 left-1 z-10 text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                        COVER
                      </span>
                    )}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeImage(index);
                      }}
                      data-testid={`admin-product-image-remove-${index}`}
                      className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-white/90 backdrop-blur text-slate-600 hover:bg-kinetic-red hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {form.images.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No images yet. The first uploaded image becomes the cover.</p>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  Tip: click any image to promote it to cover (the first image is tagged COVER).
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Name
                  </label>
                  <input
                    data-testid="admin-product-name"
                    value={form.name}
                    onChange={(event) => setField("name", event.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                      errors.name ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                    }`}
                    placeholder="e.g. Whey Protein Isolate"
                  />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Brand
                  </label>
                  <input
                    data-testid="admin-product-brand"
                    value={form.brand}
                    onChange={(event) => setField("brand", event.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                    placeholder="e.g. KINETIC"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Description
                  </label>
                  <textarea
                    data-testid="admin-product-description"
                    value={form.description}
                    onChange={(event) => setField("description", event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                    placeholder="What's in it and who is it for"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2 min-h-[40px]">
                    {chip("", "None", form.category_id === "")}
                    {categories.map((category) => (
                      chip(
                        category.id,
                        category.name,
                        form.category_id === category.id
                      )
                    ))}
                    {catsLoading && <span className="text-xs text-slate-400">loading…</span>}
                  </div>
                  {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
                </div>
                <div className="col-span-2 sm:grid-cols-2 sm:col-span-2 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      MRP (₹)
                    </label>
                    <div className="relative">
                      <input
                        data-testid="admin-product-mrp"
                        type="text"
                        value={form.mrp}
                        onChange={(event) => setField("mrp", event.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors pr-8"
                      />
                      {errors.mrp && <p className="text-xs text-red-600 mt-1 absolute -right-1 top-full">{errors.mrp}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Sale price (₹)
                    </label>
                    <div className="relative">
                      <input
                        data-testid="admin-product-sale"
                        type="text"
                        value={form.sale}
                        onChange={(event) => setField("sale", event.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors pr-8"
                      />
                      {errors.sale && <p className="text-xs text-red-600 mt-1 absolute -right-1 top-full">{errors.sale}</p>}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Discount
                    </label>
                    <span
                      data-testid="admin-product-discount-badge"
                      className={`px-3 py-1.5 rounded-xl font-extrabold text-xs uppercase ${
                        discount > 0
                          ? "bg-white/90 backdrop-blur border border-slate-200 text-kinetic-orange"
                          : "bg-slate-100 text-slate-400 border border-slate-200"
                      }`}
                    >
                      {discount > 0 ? `${discount}% OFF` : "—"}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      Computed live from MRP and sale price (₹-formatted money throughout).
                    </p>
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Stock
                  </label>
                  <input
                    data-testid="admin-product-stock"
                    type="text"
                    value={form.stock}
                    onChange={(event) => setField("stock", event.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                      errors.stock ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                    }`}
                    placeholder="0"
                  />
                  {errors.stock && <p className="text-xs text-red-600 mt-1">{errors.stock}</p>}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Flavors (comma-separated)
                  </label>
                  <input
                    data-testid="admin-product-flavors"
                    value={form.flavors}
                    onChange={(event) => setField("flavors", event.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                    placeholder="e.g. Smooth Vanilla, Dutch Cocoa"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Weights (comma-separated)
                  </label>
                  <input
                    data-testid="admin-product-weights"
                    value={form.weights}
                    onChange={(event) => setField("weights", event.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                    placeholder="e.g. 800 g, 2 kg"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Badge
                  </label>
                  <select
                    data-testid="admin-product-badge-select"
                    value={form.badge}
                    onChange={(event) => setField("badge", event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors"
                  >
                    {BADGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1 flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      data-testid="admin-new-arrival-toggle"
                      type="checkbox"
                      checked={form.isNewArrival}
                      onChange={() => toggleField("isNewArrival")}
                      className="rounded border-slate-300 text-kinetic-red focus:ring-kinetic-red"
                    />
                    New Arrival
                  </label>
                </div>
                <div className="col-span-2 sm:col-span-1 flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      data-testid="admin-product-is-active"
                      type="checkbox"
                      checked={form.isActive}
                      onChange={() => toggleField("isActive")}
                      className="rounded border-slate-300 text-kinetic-red focus:ring-kinetic-red"
                    />
                    Active on storefront
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
            <button
              data-testid="admin-product-cancel"
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              data-testid="admin-product-save"
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : mode === "edit" ? "Update product" : "Create product"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
