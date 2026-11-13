import { useCallback, useEffect, useState } from "react";
import { API, formatApiError, inr, istToUtc, fmtIst } from "../../lib/api";
import { toast } from "sonner";

/** Reads a UTC ISO string back into a `datetime-local` value for an input. */
function utcToLocalInput(iso) {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** One row of the sales list: a product that carries a sale. */
function SaleRow({ row, pct, end, overrides, onPctChange, onEndChange, onOverrideChange, onSave, onRemove, saving }) {
  const overrideEntries = Object.entries(overrides ?? {});

  const statusLabel =
    row.sale_status === "upcoming"
      ? { text: "Upcoming", className: "bg-amber-100 text-amber-800 border-amber-300" }
      : row.sale_status === "ended"
        ? { text: "Ended", className: "bg-slate-100 text-slate-500 border-slate-200" }
        : { text: "Active", className: "bg-green-100 text-green-700 border-green-300" };

  return (
    <div
      data-testid={`sales-row-${row.id}`}
      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-slate-900" data-testid={`sales-name-${row.id}`}>
            {row.name}
          </p>
          <p className="text-xs text-slate-500" data-testid={`sales-category-${row.id}`}>
            {row.category_name ?? row.category ?? "No category"}
          </p>
        </div>
        <span
          data-testid={`sales-status-${row.id}`}
          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase border ${statusLabel.className}`}
        >
          {statusLabel.text}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Sale percentage
          </label>
          <input
            data-testid={`sales-pct-edit-${row.id}`}
            type="number"
            min={1}
            max={90}
            step={1}
            value={pct}
            onChange={(event) => onPctChange(row.id, event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Sale ends at
          </label>
          <input
            data-testid={`sales-enddate-edit-${row.id}`}
            type="datetime-local"
            value={end}
            onChange={(event) => onEndChange(row.id, event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none"
          />
        </div>
      </div>

      {overrideEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Per-size sale prices
          </p>
          {overrideEntries.map(([size, salePaise], sizeIndex) => (
            <div
              key={size}
              data-testid={`sales-override-${row.id}-${sizeIndex}`}
              className="flex items-center gap-2"
            >
              <span className="text-sm font-semibold text-slate-700 w-24">{size}</span>
              <span className="text-sm text-slate-400 line-through">{inr(salePaise / 100)}</span>
              <input
                data-testid={`sales-override-${row.id}-${sizeIndex}-sale`}
                type="number"
                min={1}
                step={1}
                placeholder="auto"
                value={salePaise / 100}
                onChange={(event) =>
                  onOverrideChange(row.id, sizeIndex, event.target.value === "" ? null : Number(event.target.value))
                }
                className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
        <button
          data-testid={`sales-save-${row.id}`}
          type="button"
          onClick={() => onSave(row)}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          Save sale
        </button>
        <button
          data-testid={`sales-remove-${row.id}`}
          type="button"
          onClick={() => onRemove(row)}
          className="px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          End sale
        </button>
      </div>
    </div>
  );
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [create, setCreate] = useState({
    category_id: "",
    percentage: "10",
    start: "",
    end: "",
  });
  const [pctEdits, setPctEdits] = useState({});
  const [endEdits, setEndEdits] = useState({});
  const [overridesById, setOverridesById] = useState({});

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
  }, []);

  const createSale = async () => {
    if (!create.category_id) {
      toast.error("Pick a category");
      return;
    }
    const percentage = Number(create.percentage);
    const startsAt = istToUtc(create.start);
    const endsAt = istToUtc(create.end);
    if (!Number.isFinite(percentage) || percentage < 1 || percentage > 90) {
      toast.error("Sale percentage must be between 1 and 90");
      return;
    }
    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      toast.error("Pick a start and a later end");
      return;
    }
    try {
      const { data } = await API.post("/admin/sales/category", {
        category_id: create.category_id,
        percentage,
        starts_at: startsAt,
        ends_at: endsAt,
      });
      toast.success(`Sale started: ${data?.updated ?? 0} products updated`);
      setCreate((prev) => ({ ...prev, start: "", end: "" }));
      await fetchSales();
    } catch (error) {
      toast.error(formatApiError(error) || "Sale failed");
    }
  };

  const endCategorySale = async (categoryId) => {
    if (!categoryId) {
      return;
    }
    try {
      const { data } = await API.post("/admin/sales/end", { category_id: categoryId });
      toast.success(`Sale ended: ${data?.updated ?? 0} products updated`);
      await fetchSales();
    } catch (error) {
      toast.error(formatApiError(error) || "Sale end failed");
    }
  };

  const saveSale = async (row) => {
    setSavingId(row.id);
    const pct = pctEdits[row.id] ?? String(row.sale_percentage ?? 0);
    const endLocal = endEdits[row.id] ?? utcToLocalInput(row.sale_ends_at);
    const startLocal = utcToLocalInput(row.sale_starts_at);
    const stored = row.sale_overrides ?? {};
    const source = overridesById[row.id] ?? stored;
    const saleOverrides = {};
    for (const [size, paise] of Object.entries(source)) {
      if (paise != null) {
        saleOverrides[size] = paise;
      }
    }
    try {
      await API.patch(`/admin/products/${row.id}`, {
        sale_percentage: Number(pct),
        sale_overrides: Object.keys(saleOverrides).length > 0 ? saleOverrides : null,
        sale_starts_at: istToUtc(startLocal),
        sale_ends_at: istToUtc(endLocal),
      });
      toast.success("Sale updated");
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
      toast.success("Sale ended for this product");
      await fetchSales();
    } catch (error) {
      toast.error(formatApiError(error) || "Sale end failed");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div data-testid="admin-sales-loading" className="flex h-80 items-center justify-center text-slate-400">
        Loading sales…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h1 className="font-display font-black text-2xl text-slate-900">Sales</h1>
        <p className="text-sm text-slate-500">
          Running a sale across a whole category, or editing the sale of one product at a time.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Category
            </label>
            <select
              data-testid="sales-category-select"
              value={create.category_id}
              onChange={(event) => setCreate((prev) => ({ ...prev, category_id: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none"
            >
              <option value="">Pick a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Percentage
            </label>
            <input
              data-testid="sales-pct-input"
              type="number"
              min={1}
              max={90}
              step={1}
              value={create.percentage}
              onChange={(event) => setCreate((prev) => ({ ...prev, percentage: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Starts
            </label>
            <input
              data-testid="sales-start-input"
              type="datetime-local"
              value={create.start}
              onChange={(event) => setCreate((prev) => ({ ...prev, start: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Ends
            </label>
            <input
              data-testid="sales-end-input"
              type="datetime-local"
              value={create.end}
              onChange={(event) => setCreate((prev) => ({ ...prev, end: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1 flex items-end gap-2">
            <button
              data-testid="sales-create-btn"
              type="button"
              onClick={createSale}
              className="w-full px-4 py-2 rounded-xl text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 transition-colors"
            >
              Start sale
            </button>
            <button
              data-testid="sales-end-category-btn"
              type="button"
              onClick={() => endCategorySale(create.category_id)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              End sale
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-500" data-testid="sales-confirm">
          Starting a new sale resets any per-size sale prices on these products.
        </p>
      </div>

      {sales.length === 0 ? (
        <div data-testid="admin-sales-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          No sales yet. Start one above.
        </div>
      ) : (
        <div className="space-y-4">
          {sales.map((row) => (
            <SaleRow
              key={row.id}
              row={row}
              pct={pctEdits[row.id] ?? String(row.sale_percentage ?? 0)}
              end={endEdits[row.id] ?? utcToLocalInput(row.sale_ends_at)}
              overrides={overridesById[row.id] ?? row.sale_overrides ?? {}}
              onPctChange={(id, value) => setPctEdits((prev) => ({ ...prev, [id]: value }))}
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
  );
}
