import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Edit2, RefreshCw } from "lucide-react";
import { API, formatApiError } from "../../lib/api";
import { toast } from "sonner";

export default function Categories() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    image_url: "",
    tagline: "",
    sort_order: "",
  });
  const [errors, setErrors] = useState({});

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/admin/categories");
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const validate = () => {
    const next = {};
    if (!form.name.trim()) {
      next.name = "Name is required";
    }
    setErrors(next);
    return Object.keys(next).length > 0;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (validate()) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        image_url: form.image_url.trim() || undefined,
        tagline: form.tagline.trim() || undefined,
        sort_order: form.sort_order === "" ? undefined : Number(form.sort_order),
      };
      if (editing) {
        await API.patch(`/admin/categories/${editing.id}`, payload);
        toast.success("Category updated");
      } else {
        await API.post("/admin/categories", payload);
        toast.success("Category created");
      }
      setOpen(false);
      setEditing(null);
      await fetchCategories();
    } catch (error) {
      toast.error(formatApiError(error) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Delete this category? Categories that still hold products cannot be deleted and the action will be refused.",
      )
    ) {
      return;
    }
    setDeleting(id);
    try {
      await API.delete(`/admin/categories/${id}`);
      toast.success("Category deleted");
      await fetchCategories();
    } catch (error) {
      toast.error(formatApiError(error) || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    setForm({ name: "", slug: "", image_url: "", tagline: "", sort_order: "" });
    setErrors({});
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900">
            Categories
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Product categories. A category that holds products cannot be deleted.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            data-testid="admin-refresh-categories"
            onClick={fetchCategories}
            disabled={refreshing}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            data-testid="admin-add-category"
            onClick={() => {
              setEditing(null);
              setForm({ name: "", slug: "", image_url: "", tagline: "", sort_order: "" });
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-kinetic-red text-white text-sm font-bold hover:bg-red-600 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add category
          </button>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <AnimatePresence>
          {loading ? (
            <div key="loading" data-testid="admin-categories-loading" className="flex h-80 items-center justify-center text-slate-400 px-6">
              Loading categories…
            </div>
          ) : (
            <div key="grid">
              {items.length === 0 ? (
                <div data-testid="admin-categories-empty" className="p-12 text-center text-slate-500">
                  No categories yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                  {items.map((category) => (
                    <div
                      key={category.id}
                      data-testid={`admin-category-card-${category.id}`}
                      className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 mb-3">
                        {category.image_url ? (
                          <img
                            src={category.image_url}
                            alt={category.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                            <span className="text-slate-400 text-xs">No image</span>
                          </div>
                        )}
                      </div>
                      <h3 className="font-display font-bold text-slate-900" data-testid={`admin-category-name-${category.id}`}>
                        {category.name}
                      </h3>
                      {category.tagline && (
                        <p className="text-sm text-slate-500 mt-0.5" data-testid={`admin-category-tagline-${category.id}`}>
                          {category.tagline}
                        </p>
                      )}
                      <span className="mt-auto text-xs font-bold text-slate-400 uppercase" data-testid={`admin-category-count-${category.id}`}>
                        {category.product_count ?? 0} products
                      </span>
                      <div className="mt-3 flex gap-2">
                        <button
                          data-testid={`admin-category-edit-${category.id}`}
                          onClick={() => {
                            setEditing(category);
                            setForm({
                              name: category.name,
                              slug: category.slug ?? "",
                              image_url: category.image_url ?? "",
                              tagline: category.tagline ?? "",
                              sort_order: category.sort_order ?? "",
                            });
                            setOpen(true);
                          }}
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          data-testid={`admin-category-delete-${category.id}`}
                          onClick={() => handleDelete(category.id)}
                          disabled={deleting === category.id}
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-kinetic-red disabled:opacity-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCloseSaveForm}>
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
            className="absolute top-10 sm:top-6 left-4 sm:left-[10%] w-full sm:w-[80%] max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-xl text-slate-900">
                {editing ? "Edit category" : "Add category"}
              </h2>
              <button
                data-testid="admin-category-form-close"
                onClick={closeForm}
                className="text-slate-400 hover:text-slate-900"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Name
                </label>
                <input
                  data-testid="admin-category-name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors ${
                    errors.name ? "border-red-500 ring-1 ring-red-500" : "border-slate-200"
                  }`}
                  placeholder="e.g. Proteins"
                />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Slug (URL key)
                </label>
                <input
                  data-testid="admin-category-slug"
                  value={form.slug}
                  onChange={(event) => setField("slug", event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                  placeholder="e.g. proteins"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Image URL
                </label>
                <input
                  data-testid="admin-category-image-url"
                  value={form.image_url}
                  onChange={(event) => setField("image_url", event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                  placeholder="/api/images/products/...jpg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Tagline
                </label>
                <input
                  data-testid="admin-category-tagline"
                  value={form.tagline}
                  onChange={(event) => setField("tagline", event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                  placeholder="e.g. Whey, isolate & plant protein"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Sort order
                </label>
                <input
                  data-testid="admin-category-sort-order"
                  type="text"
                  value={form.sort_order}
                  onChange={(event) => setField("sort_order", event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                  placeholder="0"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  data-testid="admin-category-cancel"
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  data-testid="admin-category-save"
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "Saving…" : "Save category"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );

}
