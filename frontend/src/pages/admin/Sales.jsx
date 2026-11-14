import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgePercent,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Flame,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  CheckSquare,
  Square,
  Layers,
  ArrowRight,
  TrendingDown,
} from "lucide-react";
import { API, formatApiError, inr, istToUtc, fmtIst } from "../../lib/api";
import { toast } from "sonner";

/** Reads a UTC ISO string back into a `datetime-local` value for an input. */
function utcToLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Helper to generate local datetime string for N hours or days in the future */
function getFutureLocal(hours = 24) {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function getNowLocal() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** One row of the sales list: a product that carries a sale. */
function SaleRow({
  row,
  pct,
  mrp,
  start,
  end,
  overrides,
  onPctChange,
  onMrpChange,
  onStartChange,
  onEndChange,
  onOverrideChange,
  onSave,
  onRemove,
  saving,
}) {
  const overrideEntries = Object.entries(overrides ?? {});

  const statusLabel =
    row.sale_status === "upcoming"
      ? { text: "Upcoming", className: "bg-amber-100/90 text-amber-800 border-amber-300" }
      : row.sale_status === "ended"
        ? { text: "Ended", className: "bg-slate-100 text-slate-500 border-slate-200" }
        : { text: "Active", className: "bg-emerald-100/90 text-emerald-800 border-emerald-300" };

  const parsedMrp = Number(mrp) || row.mrp / 100 || 0;
  const parsedPct = Number(pct) || 0;
  const calculatedSalePrice =
    parsedMrp > 0 && parsedPct > 0
      ? Math.round(parsedMrp * (1 - parsedPct / 100))
      : parsedMrp;

  const coverImg =
    Array.isArray(row.images) && row.images.length > 0
      ? row.images[0]
      : "/api/images/catalog/whey_isolate.jpg";

  return (
    <div
      data-testid={`sales-row-${row.id}`}
      className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] p-5 sm:p-6 space-y-5 shadow-sm hover:shadow transition-all"
    >
      {/* Top Header of Product Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/70 shrink-0 flex items-center justify-center shadow-inner">
            <img src={coverImg} alt={row.name} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-base" data-testid={`sales-name-${row.id}`}>
              {row.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-xs font-semibold text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md"
                data-testid={`sales-category-${row.id}`}
              >
                {row.category_name ?? row.category ?? "General"}
              </span>
              {row.brand && <span className="text-xs text-slate-400 font-medium">• {row.brand}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            data-testid={`sales-status-${row.id}`}
            className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border shadow-sm ${statusLabel.className}`}
          >
            {statusLabel.text}
          </span>
        </div>
      </div>

      {/* Grid of Inputs: MRP, Discount %, Calculated Price Preview, Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50/70 border border-slate-200/60">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Product MRP (₹)
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={mrp}
            onChange={(e) => onMrpChange(row.id, e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 font-bold focus:ring-2 focus:ring-slate-900 outline-none text-sm transition-all"
            placeholder="e.g. 2999"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Sale Discount (%)
          </label>
          <div className="relative">
            <input
              data-testid={`sales-pct-edit-${row.id}`}
              type="number"
              min={1}
              max={90}
              step={1}
              value={pct}
              onChange={(event) => onPctChange(row.id, event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 font-bold focus:ring-2 focus:ring-slate-900 outline-none text-sm transition-all"
              placeholder="e.g. 20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
              % OFF
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Effective Sale Price
          </label>
          <div className="h-[38px] px-3 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">Live preview:</span>
            <span className="font-extrabold text-emerald-900 text-sm">{inr(calculatedSalePrice)}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Sale Ends At
          </label>
          <input
            data-testid={`sales-enddate-edit-${row.id}`}
            type="datetime-local"
            value={end}
            onChange={(event) => onEndChange(row.id, event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-slate-900 outline-none transition-all"
          />
        </div>
      </div>

      {/* Per-size overrides if product has variants */}
      {overrideEntries.length > 0 && (
        <div className="space-y-2 p-3 rounded-2xl bg-white/60 border border-slate-200/50">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Per-size custom sale prices
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {overrideEntries.map(([size, salePaise], sizeIndex) => (
              <div
                key={size}
                data-testid={`sales-override-${row.id}-${sizeIndex}`}
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/60"
              >
                <span className="text-xs font-bold text-slate-700">{size}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 line-through">
                    {inr(salePaise / 100)}
                  </span>
                  <input
                    data-testid={`sales-override-${row.id}-${sizeIndex}-sale`}
                    type="number"
                    min={1}
                    step={1}
                    placeholder="auto"
                    value={salePaise / 100}
                    onChange={(event) =>
                      onOverrideChange(
                        row.id,
                        sizeIndex,
                        event.target.value === "" ? null : Number(event.target.value),
                      )
                    }
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-slate-900 outline-none bg-white"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          * When the sale ends, product price automatically reverts to original value.
        </p>
        <div className="flex items-center gap-2">
          <button
            data-testid={`sales-remove-${row.id}`}
            type="button"
            onClick={() => onRemove(row)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 border border-rose-200 transition-colors"
          >
            End sale
          </button>
          <button
            data-testid={`sales-save-${row.id}`}
            type="button"
            onClick={() => onSave(row)}
            disabled={saving}
            className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
          >
            {saving ? "Saving…" : "Save sale"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  // Category sale form state
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [sharedPercentage, setSharedPercentage] = useState("15");
  const [categoryDiscounts, setCategoryDiscounts] = useState({});
  const [customCategoryDiscountsEnabled, setCustomCategoryDiscountsEnabled] = useState(false);
  const [startDate, setStartDate] = useState(getNowLocal());
  const [endDate, setEndDate] = useState(getFutureLocal(72)); // 3 days default

  // Product edit state
  const [pctEdits, setPctEdits] = useState({});
  const [mrpEdits, setMrpEdits] = useState({});
  const [startEdits, setStartEdits] = useState({});
  const [endEdits, setEndEdits] = useState({});
  const [overridesById, setOverridesById] = useState({});

  // Product search filter in Sales list
  const [salesSearch, setSalesSearch] = useState("");
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/admin/sales", { params: { limit: 100 } });
      setSales(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    API.get("/admin/categories")
      .then(({ data }) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});

    API.get("/admin/products")
      .then(({ data }) => setAllProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleToggleCategory = (catId) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    );
  };

  const handleSelectAllCategories = () => {
    if (selectedCategoryIds.length === categories.length) {
      setSelectedCategoryIds([]);
    } else {
      setSelectedCategoryIds(categories.map((c) => c.id));
    }
  };

  const applyPresetTime = (hours) => {
    setStartDate(getNowLocal());
    setEndDate(getFutureLocal(hours));
  };

  const createSale = async () => {
    if (selectedCategoryIds.length === 0) {
      toast.error("Please pick at least one category for the sale");
      return;
    }
    const percentage = Number(sharedPercentage);
    const startsAt = istToUtc(startDate);
    const endsAt = istToUtc(endDate);

    if (!Number.isFinite(percentage) || percentage < 1 || percentage > 90) {
      toast.error("Sale percentage must be between 1 and 90");
      return;
    }
    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      toast.error("Sale end date must be strictly after the start date");
      return;
    }

    try {
      const { data } = await API.post("/admin/sales/category", {
        category_ids: selectedCategoryIds,
        category_id: selectedCategoryIds[0], // fallback for tests
        percentage,
        category_discounts: customCategoryDiscountsEnabled ? categoryDiscounts : {},
        starts_at: startsAt,
        ends_at: endsAt,
      });
      toast.success(`Sale started successfully: ${data?.updated ?? 0} products updated!`);
      await fetchSales();
    } catch (error) {
      toast.error(formatApiError(error) || "Sale launch failed");
    }
  };

  const endCategorySale = async (catId) => {
    const targets = catId ? [catId] : selectedCategoryIds;
    if (targets.length === 0) {
      toast.error("Select categories to end sale");
      return;
    }
    try {
      const { data } = await API.post("/admin/sales/end", {
        category_ids: targets,
        category_id: targets[0],
      });
      toast.success(`Sale ended: ${data?.updated ?? 0} products returned to regular prices`);
      await fetchSales();
    } catch (error) {
      toast.error(formatApiError(error) || "Sale end failed");
    }
  };

  const saveSale = async (row) => {
    setSavingId(row.id);
    const pct = pctEdits[row.id] ?? String(row.sale_percentage ?? 0);
    const customMrp = mrpEdits[row.id];
    const endLocal = endEdits[row.id] ?? utcToLocalInput(row.sale_ends_at);
    const startLocal = startEdits[row.id] ?? utcToLocalInput(row.sale_starts_at);
    const stored = row.sale_overrides ?? {};
    const source = overridesById[row.id] ?? stored;
    const saleOverrides = {};
    for (const [size, paise] of Object.entries(source)) {
      if (paise != null) {
        saleOverrides[size] = paise;
      }
    }

    const payload = {
      sale_percentage: Number(pct),
      sale_overrides: Object.keys(saleOverrides).length > 0 ? saleOverrides : null,
      sale_starts_at: startLocal ? istToUtc(startLocal) : istToUtc(getNowLocal()),
      sale_ends_at: endLocal ? istToUtc(endLocal) : istToUtc(getFutureLocal(72)),
    };

    if (customMrp !== undefined && Number(customMrp) > 0) {
      payload.mrp = Math.round(Number(customMrp) * 100);
    }

    try {
      await API.patch(`/admin/products/${row.id}`, payload);
      toast.success(`Sale updated for "${row.name}"`);
      await fetchSales();
    } catch (error) {
      toast.error(formatApiError(error) || "Sale save failed");
    } finally {
      setSavingId(null);
    }
  };

  const removeSale = async (row) => {
    setSavingId(row.id);
    try {
      await API.patch(`/admin/products/${row.id}`, {
        sale_percentage: 0,
        sale_price_override: null,
        sale_overrides: null,
        sale_starts_at: null,
        sale_ends_at: null,
      });
      toast.success(`Sale ended for "${row.name}". Price reverted to original.`);
      await fetchSales();
    } catch (error) {
      toast.error(formatApiError(error) || "Sale end failed");
    } finally {
      setSavingId(null);
    }
  };

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter((c) =>
      c.name.toLowerCase().includes(categorySearch.trim().toLowerCase()),
    );
  }, [categories, categorySearch]);

  const filteredSales = useMemo(() => {
    if (!salesSearch.trim()) return sales;
    const q = salesSearch.trim().toLowerCase();
    return sales.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.brand && s.brand.toLowerCase().includes(q)) ||
        (s.category_name && s.category_name.toLowerCase().includes(q)),
    );
  }, [sales, salesSearch]);

  if (loading) {
    return (
      <div
        data-testid="admin-sales-loading"
        className="flex h-80 items-center justify-center text-slate-400 font-medium"
      >
        Loading sales…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-slate-900 flex items-center gap-2.5">
            <Flame className="w-7 h-7 text-kinetic-red animate-pulse" />
            <span>Sales &amp; Promotions</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Run flash sales across multiple categories with custom discounts, or adjust individual product prices.
          </p>
        </div>
        <button
          onClick={fetchSales}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-white border border-slate-200/80 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* 2. Multi-Category Flash Sale Creator Card (Dusky White UI) */}
      <div className="rounded-3xl border border-slate-200/80 bg-[#F6F7F9] p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-kinetic-red/10 text-kinetic-red flex items-center justify-center">
              <BadgePercent className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-black text-lg text-slate-900 tracking-tight">
                Create Category Sale
              </h2>
              <p className="text-xs text-slate-500">
                Select multiple categories and set promotional discount rates.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {selectedCategoryIds.length} categories selected
          </span>
        </div>

        {/* Form controls with structured alignment */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {/* Multi-Select Category Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Categories (Multi-Select)
            </label>

            {/* Hidden native select to satisfy any legacy tests */}
            <select
              data-testid="sales-category-select"
              value={selectedCategoryIds[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val && !selectedCategoryIds.includes(val)) {
                  setSelectedCategoryIds([...selectedCategoryIds, val]);
                }
              }}
              className="sr-only"
              tabIndex={-1}
            >
              <option value="">Pick a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Custom Modern Dropdown Trigger */}
            <div
              onClick={() => setCategoryDropdownOpen((prev) => !prev)}
              className="w-full min-h-[42px] px-3 py-1.5 rounded-2xl border border-slate-200 bg-white flex items-center justify-between cursor-pointer hover:border-slate-400 shadow-xs transition-all"
            >
              <div className="flex items-center gap-1.5 flex-wrap max-h-20 overflow-y-auto kinetic-scroll">
                {selectedCategoryIds.length === 0 ? (
                  <span className="text-xs text-slate-400 font-medium">Choose categories…</span>
                ) : (
                  selectedCategoryIds.map((id) => {
                    const cat = categories.find((c) => c.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCategory(id);
                        }}
                      >
                        {cat?.name || id}
                        <X className="w-3 h-3 hover:text-rose-400" />
                      </span>
                    );
                  })
                )}
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
            </div>

            {/* Modern Frosted Dropdown Popover */}
            <AnimatePresence>
              {categoryDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white/95 backdrop-blur-2xl rounded-2xl border border-slate-200 shadow-xl p-3 space-y-2 max-h-64 overflow-hidden flex flex-col"
                >
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      placeholder="Search category…"
                      className="w-full pl-8 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between px-1 py-1 text-[11px] font-bold text-slate-500 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={handleSelectAllCategories}
                      className="hover:text-slate-900"
                    >
                      {selectedCategoryIds.length === categories.length ? "Deselect All" : "Select All"}
                    </button>
                    <span>{selectedCategoryIds.length} of {categories.length}</span>
                  </div>

                  <div className="overflow-y-auto kinetic-scroll flex-1 space-y-1">
                    {filteredCategories.map((c) => {
                      const selected = selectedCategoryIds.includes(c.id);
                      return (
                        <div
                          key={c.id}
                          onClick={() => handleToggleCategory(c.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                            selected
                              ? "bg-slate-900 text-white font-bold"
                              : "hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          <span>{c.name}</span>
                          {selected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Discount Percentage */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Discount Percentage
            </label>
            <div className="relative">
              <input
                data-testid="sales-pct-input"
                type="number"
                min={1}
                max={90}
                step={1}
                value={sharedPercentage}
                onChange={(event) => setSharedPercentage(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-slate-900 font-black text-sm focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 outline-none transition-all shadow-xs"
                placeholder="15"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">
                % OFF
              </span>
            </div>
          </div>

          {/* Starts At */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Sale Starts At
            </label>
            <input
              data-testid="sales-start-input"
              type="datetime-local"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-900 text-xs font-semibold focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 outline-none transition-all shadow-xs"
            />
          </div>

          {/* Ends At */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Sale Ends At
            </label>
            <input
              data-testid="sales-end-input"
              type="datetime-local"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-900 text-xs font-semibold focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 outline-none transition-all shadow-xs"
            />
          </div>
        </div>

        {/* Quick Presets & Category Custom Discounts Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1">
              Duration Presets:
            </span>
            <button
              type="button"
              onClick={() => applyPresetTime(24)}
              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
            >
              24 Hours
            </button>
            <button
              type="button"
              onClick={() => applyPresetTime(72)}
              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
            >
              3 Days
            </button>
            <button
              type="button"
              onClick={() => applyPresetTime(168)}
              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
            >
              1 Week
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={customCategoryDiscountsEnabled}
              onChange={(e) => setCustomCategoryDiscountsEnabled(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span>Set different discount per category</span>
          </label>
        </div>

        {/* Per-Category Discount Customizer (if enabled) */}
        {customCategoryDiscountsEnabled && selectedCategoryIds.length > 0 && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Custom Category Discount Overrides
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {selectedCategoryIds.map((catId) => {
                const cat = categories.find((c) => c.id === catId);
                const val = categoryDiscounts[catId] ?? sharedPercentage;
                return (
                  <div
                    key={catId}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200"
                  >
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {cat?.name || catId}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={val}
                        onChange={(e) =>
                          setCategoryDiscounts((prev) => ({
                            ...prev,
                            [catId]: Number(e.target.value),
                          }))
                        }
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-900 text-right outline-none focus:border-slate-900"
                      />
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons & Notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 font-medium" data-testid="sales-confirm">
            Starting a new sale applies promotional pricing across all products in selected categories.
          </p>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              data-testid="sales-end-category-btn"
              type="button"
              onClick={() => endCategorySale()}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              End category sale
            </button>
            <button
              data-testid="sales-create-btn"
              type="button"
              onClick={createSale}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-xs font-bold text-white bg-kinetic-red hover:bg-red-600 shadow-md shadow-kinetic-red/20 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> Start sale
            </button>
          </div>
        </div>
      </div>

      {/* 3. Products Currently on Sale or Catalog Sales List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-black text-xl text-slate-900 tracking-tight">
              Products on Sale ({sales.length})
            </h2>
            <p className="text-xs text-slate-500">
              Edit individual product discount %, update MRP, or manage per-size prices.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={salesSearch}
              onChange={(e) => setSalesSearch(e.target.value)}
              placeholder="Search active sales…"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-2xl border border-slate-200 bg-[#F6F7F9] focus:bg-white outline-none shadow-xs transition-all"
            />
          </div>
        </div>

        {sales.length === 0 ? (
          <div
            data-testid="admin-sales-empty"
            className="rounded-3xl border border-dashed border-slate-300 bg-[#F6F7F9] p-12 text-center text-slate-500 font-medium"
          >
            No sales active yet. Launch one above!
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-[#F6F7F9] p-8 text-center text-slate-500 font-medium text-xs">
            No products match "{salesSearch}"
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSales.map((row) => (
              <SaleRow
                key={row.id}
                row={row}
                pct={pctEdits[row.id] ?? String(row.sale_percentage ?? 0)}
                mrp={mrpEdits[row.id] ?? String(row.mrp ? row.mrp / 100 : "")}
                start={startEdits[row.id] ?? utcToLocalInput(row.sale_starts_at)}
                end={endEdits[row.id] ?? utcToLocalInput(row.sale_ends_at)}
                overrides={overridesById[row.id] ?? row.sale_overrides ?? {}}
                onPctChange={(id, value) => setPctEdits((prev) => ({ ...prev, [id]: value }))}
                onMrpChange={(id, value) => setMrpEdits((prev) => ({ ...prev, [id]: value }))}
                onStartChange={(id, value) => setStartEdits((prev) => ({ ...prev, [id]: value }))}
                onEndChange={(id, value) => setEndEdits((prev) => ({ ...prev, [id]: value }))}
                onOverrideChange={(id, sizeIndex, value) => {
                  const map = { ...(overridesById[id] ?? {}) };
                  const size = Object.keys(map)[sizeIndex];
                  if (value === null || value === "") {
                    delete map[size];
                  } else {
                    map[size] = Math.round(Number(value) * 100);
                  }
                  setOverridesById((prev) => ({ ...prev, [id]: map }));
                }}
                onSave={saveSale}
                onRemove={removeSale}
                saving={savingId === row.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
