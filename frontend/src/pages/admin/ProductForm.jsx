import { useCallback, useEffect, useRef, useState } from "react";
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
  flavorRows: [{ label: "", image: "" }],
  sizeRows: [{ label: "", price: "", image: "" }],
  contents: "",
  nutrition: "",
  badge: "none",
  isNewArrival: false,
  isActive: true,
  images: [],
});

/** The fallback of an empty row list: one blank row to start typing into. */
const blankFlavorRow = () => ({ label: "", image: "" });
const blankSizeRow = () => ({ label: "", price: "", image: "" });

/** Turns a product served by the API into the form's local state. */
const loadForm = (product) => {
  // The rows follow the label order of the product; the maps only fill the
  // photo and the per-size price of a row that carries one.
  const flavorRows = (Array.isArray(product.flavors) ? product.flavors : []).map((label) => ({
    label,
    image: product.flavor_images?.[label] ?? "",
  }));
  const sizeRows = (Array.isArray(product.weight_options) ? product.weight_options : []).map(
    (label) => ({
      label,
      price:
        product.weight_prices?.[label] != null
          ? String(product.weight_prices[label] / 100)
          : "",
      image: product.weight_images?.[label] ?? "",
    }),
  );

  return {
    name: product.name ?? "",
    brand: product.brand ?? "",
    description: product.description ?? "",
    category_id: product.category_id ?? "",
    mrp: product.mrp != null ? String(product.mrp / 100) : "",
    sale: product.sale_price != null ? String(product.sale_price / 100) : "",
    stock: product.stock != null ? String(product.stock) : "",
    flavorRows: flavorRows.length > 0 ? flavorRows : [blankFlavorRow()],
    sizeRows: sizeRows.length > 0 ? sizeRows : [blankSizeRow()],
    contents: product.contents ?? "",
    nutrition: product.nutrition ?? "",
    badge: product.badge ?? "none",
    isNewArrival: product.is_new_arrival === 1,
    isActive: product.is_active === 1,
    images: Array.isArray(product.images) ? [...product.images] : [],
  };
};

export default function ProductForm({ product: initialProduct, onSave, onClose }) {
  const [mode, setMode] = useState(initialProduct ? "edit" : "create");
  const [item, setItem] = useState(initialProduct ?? null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [errors, setErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [discount, setDiscount] = useState(0);
  const fileInputRef = useRef(null);
  // The hidden input of the per-row photo upload: the row it serves is set
  // just before the file dialog opens.
  const variantFileRef = useRef(null);
  const [variantTarget, setVariantTarget] = useState(null);

  // ---------- bootstrap ----------
  useEffect(() => {
    let alive = true;
    // The form state is decided BEFORE the categories fetch: a reset that
    // waited for the network could wipe what a fast admin already typed.
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
    fetchCategories();
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
    // Every row needs a label; a filled price has to be a number above 0.
    form.flavorRows.forEach((row, index) => {
      if (!row.label.trim()) {
        next[`flavorLabel-${index}`] = "Label is required";
      }
    });
    form.sizeRows.forEach((row, index) => {
      if (!row.label.trim()) {
        next[`sizeLabel-${index}`] = "Label is required";
      }
      if (row.price !== "") {
        const price = Number(row.price);
        if (!Number.isFinite(price) || price <= 0) {
          next[`sizePrice-${index}`] = "Price must be a number above 0";
        }
      }
    });
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

  // ---------- flavor and size rows ----------
  const setFlavorRow = (index, key, value) => {
    setForm((prev) => {
      const rows = [...prev.flavorRows];
      rows[index] = { ...rows[index], [key]: value };
      return { ...prev, flavorRows: rows };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`flavorLabel-${index}`];
      return next;
    });
  };

  const addFlavorRow = () => {
    setForm((prev) => ({ ...prev, flavorRows: [...prev.flavorRows, blankFlavorRow()] }));
  };

  const removeFlavorRow = (index) => {
    setForm((prev) => {
      const rows = prev.flavorRows.filter((_, i) => i !== index);
      return { ...prev, flavorRows: rows.length > 0 ? rows : [blankFlavorRow()] };
    });
  };

  const setSizeRow = (index, key, value) => {
    setForm((prev) => {
      const rows = [...prev.sizeRows];
      rows[index] = { ...rows[index], [key]: value };
      return { ...prev, sizeRows: rows };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`sizeLabel-${index}`];
      delete next[`sizePrice-${index}`];
      return next;
    });
  };

  const addSizeRow = () => {
    setForm((prev) => ({ ...prev, sizeRows: [...prev.sizeRows, blankSizeRow()] }));
  };

  const removeSizeRow = (index) => {
    setForm((prev) => {
      const rows = prev.sizeRows.filter((_, i) => i !== index);
      return { ...prev, sizeRows: rows.length > 0 ? rows : [blankSizeRow()] };
    });
  };

  /** Opens the file dialog for one flavor or size row's photo. */
  const pickVariantPhoto = (kind, index) => {
    setVariantTarget({ kind, index });
    variantFileRef.current?.click();
  };

  /** Uploads the picked file and pins its URL to the row the dialog was for. */
  const uploadVariantPhoto = (file) => {
    // Let choosing the same file again fire a change event next time.
    if (variantFileRef.current) {
      variantFileRef.current.value = "";
    }
    if (!variantTarget || !file) {
      return;
    }
    if (!file.type || !file.type.startsWith("image/")) {
      toast.error(`"${file.name}" is not an image`);
      return;
    }
    const { kind, index } = variantTarget;
    const data = new FormData();
    data.append("file", file);
    API.post("/admin/uploads", data)
      .then((response) => {
        const url = response.data?.url;
        if (!url) return;
        setForm((prev) => {
          if (kind === "flavor") {
            const rows = [...prev.flavorRows];
            rows[index] = { ...rows[index], image: url };
            return { ...prev, flavorRows: rows };
          }
          const rows = [...prev.sizeRows];
          rows[index] = { ...rows[index], image: url };
          return { ...prev, sizeRows: rows };
        });
      })
      .catch((uploadError) => {
        toast.error(formatApiError(uploadError) || "Image upload failed");
      });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (validate()) {
      return;
    }
    setSaving(true);
    try {
      // The rows become the label lists and the maps. Rows without a label
      // are not saved; a size without a price simply inherits the base price.
      const flavors = [];
      const flavor_images = {};
      form.flavorRows.forEach((row) => {
        const label = row.label.trim();
        if (!label) return;
        flavors.push(label);
        if (row.image) {
          flavor_images[label] = row.image;
        }
      });
      const weight_options = [];
      const weight_prices = {};
      const weight_images = {};
      form.sizeRows.forEach((row) => {
        const label = row.label.trim();
        if (!label) return;
        weight_options.push(label);
        if (row.price !== "") {
          weight_prices[label] = toPaise(row.price);
        }
        if (row.image) {
          weight_images[label] = row.image;
        }
      });

      const payload = {
        name: form.name,
        brand: form.brand,
        description: form.description,
        category_id: form.category_id || undefined,
        mrp: toPaise(form.mrp),
        sale_price: toPaise(form.sale),
        stock: form.stock === "" ? 0 : Number(form.stock),
        images: form.images,
        flavors,
        weight_options,
        flavor_images,
        weight_images,
        weight_prices,
        contents: form.contents,
        nutrition: form.nutrition,
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
      type="button"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
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
        onClick={(event) => event.stopPropagation()}
        className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto kinetic-scroll bg-white rounded-2xl border border-slate-200 shadow-2xl p-6"
        data-lenis-prevent
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-xl text-slate-900">
            {mode === "edit" ? "Edit product" : "Add product"}
          </h2>
          <button
            type="button"
            data-testid="admin-product-form-close"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 p-1"
          >
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
                onClick={() => fileInputRef.current?.click()}
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
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleFiles(event.target.files)}
                />
                {/* The one hidden input of the per-row photo uploads: the
                    target row is set right before the dialog opens. Its own
                    click must not bubble — it sits inside the clickable
                    dropzone, and a bubbling click would open the GALLERY
                    chooser instead of this one. */}
                <input
                  ref={variantFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => uploadVariantPhoto(event.target.files?.[0])}
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
                      type="button"
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
                {/* Flavors: one row per label, each with an optional photo. */}
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                      Flavors
                    </h3>
                    <button
                      type="button"
                      data-testid="flavor-add-btn"
                      onClick={addFlavorRow}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-kinetic-red border border-slate-200 hover:border-kinetic-red transition-colors"
                    >
                      + Add flavor
                    </button>
                  </div>
                  {form.flavorRows.map((row, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="flex-1">
                        <input
                          data-testid={`flavor-label-${index}`}
                          value={row.label}
                          onChange={(event) => setFlavorRow(index, "label", event.target.value)}
                          className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                            errors[`flavorLabel-${index}`] ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                          }`}
                          placeholder="e.g. Smooth Vanilla"
                        />
                        {errors[`flavorLabel-${index}`] && (
                          <p className="text-xs text-red-600 mt-1">{errors[`flavorLabel-${index}`]}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        data-testid={`flavor-photo-btn-${index}`}
                        onClick={() => pickVariantPhoto("flavor", index)}
                        title={row.image ? "Change photo" : "Add photo"}
                        className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center overflow-hidden transition-colors ${
                          row.image
                            ? "border-transparent"
                            : "border-slate-200 text-slate-400 hover:border-kinetic-red hover:text-kinetic-red"
                        }`}
                      >
                        {row.image ? (
                          <img src={row.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid={`flavor-remove-${index}`}
                        onClick={() => removeFlavorRow(index)}
                        className="w-10 h-10 shrink-0 rounded-xl border border-slate-200 text-slate-400 hover:bg-kinetic-red hover:text-white hover:border-kinetic-red flex items-center justify-center transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* Sizes: label, optional per-size price (₹, blank inherits the
                    base price) and the photo the card shows for the size. */}
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                      Sizes
                    </h3>
                    <button
                      type="button"
                      data-testid="size-add-btn"
                      onClick={addSizeRow}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-kinetic-red border border-slate-200 hover:border-kinetic-red transition-colors"
                    >
                      + Add size
                    </button>
                  </div>
                  {form.sizeRows.map((row, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="flex-1">
                        <input
                          data-testid={`size-label-${index}`}
                          value={row.label}
                          onChange={(event) => setSizeRow(index, "label", event.target.value)}
                          className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                            errors[`sizeLabel-${index}`] ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                          }`}
                          placeholder="e.g. 2 kg"
                        />
                        {errors[`sizeLabel-${index}`] && (
                          <p className="text-xs text-red-600 mt-1">{errors[`sizeLabel-${index}`]}</p>
                        )}
                      </div>
                      <div className="w-32">
                        <input
                          data-testid={`size-price-${index}`}
                          type="text"
                          value={row.price}
                          onChange={(event) => setSizeRow(index, "price", event.target.value)}
                          className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                            errors[`sizePrice-${index}`] ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                          }`}
                          placeholder="₹ (blank = base)"
                        />
                        {errors[`sizePrice-${index}`] && (
                          <p className="text-xs text-red-600 mt-1">{errors[`sizePrice-${index}`]}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        data-testid={`size-photo-btn-${index}`}
                        onClick={() => pickVariantPhoto("size", index)}
                        title={row.image ? "Change photo" : "Add photo"}
                        className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center overflow-hidden transition-colors ${
                          row.image
                            ? "border-transparent"
                            : "border-slate-200 text-slate-400 hover:border-kinetic-red hover:text-kinetic-red"
                        }`}
                      >
                        {row.image ? (
                          <img src={row.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid={`size-remove-${index}`}
                        onClick={() => removeSizeRow(index)}
                        className="w-10 h-10 shrink-0 rounded-xl border border-slate-200 text-slate-400 hover:bg-kinetic-red hover:text-white hover:border-kinetic-red flex items-center justify-center transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* The two texts of the product box. */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    What&apos;s inside
                  </label>
                  <textarea
                    data-testid="contents-input"
                    value={form.contents}
                    onChange={(event) => setField("contents", event.target.value)}
                    rows={2}
                    className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                    placeholder="e.g. 2 scoops, 1 shaker"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Nutrition
                  </label>
                  <textarea
                    data-testid="nutrition-input"
                    value={form.nutrition}
                    onChange={(event) => setField("nutrition", event.target.value)}
                    rows={2}
                    className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                    placeholder="e.g. 24 g protein per serving"
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
