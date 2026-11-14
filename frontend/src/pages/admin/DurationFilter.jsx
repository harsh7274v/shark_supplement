import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function getLocalDateString(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateString(d);
}

export const DURATION_OPTIONS = [
  { key: "all", label: "All Time" },
  { key: "7days", label: "7 Days", days: 7 },
  { key: "month", label: "Month (30 Days)", days: 30 },
  { key: "3months", label: "3 Months (90 Days)", days: 90 },
  { key: "year", label: "Year (365 Days)", days: 365 },
  { key: "custom", label: "Custom Range" },
];

export function isWithinDateRange(createdAt, from, to) {
  if (!createdAt) return true;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return true;
  const itemDateStr = getLocalDateString(d);
  if (from && itemDateStr < from) return false;
  if (to && itemDateStr > to) return false;
  return true;
}

export default function DurationFilter({
  value = "all",
  from = "",
  to = "",
  onChange,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(value);
  const [customFrom, setCustomFrom] = useState(from || getDateDaysAgo(7));
  const [customTo, setCustomTo] = useState(to || getLocalDateString());
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectOption = (option) => {
    setSelectedKey(option.key);
    if (option.key === "all") {
      setOpen(false);
      onChange?.({ duration: "all", from: "", to: "", label: "All Time" });
    } else if (option.key === "custom") {
      // Keep open so user can pick custom dates
    } else {
      const computedFrom = getDateDaysAgo(option.days);
      const computedTo = getLocalDateString();
      setOpen(false);
      onChange?.({
        duration: option.key,
        from: computedFrom,
        to: computedTo,
        label: option.label,
      });
    }
  };

  const handleApplyCustom = () => {
    setOpen(false);
    onChange?.({
      duration: "custom",
      from: customFrom,
      to: customTo,
      label: `${customFrom} to ${customTo}`,
    });
  };

  const activeOption = DURATION_OPTIONS.find((o) => o.key === selectedKey) || DURATION_OPTIONS[0];

  const getDisplayLabel = () => {
    if (selectedKey === "custom" && from && to) {
      return `${from} – ${to}`;
    }
    return activeOption.label;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        data-testid="duration-filter-trigger"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-slate-200 bg-[#F6F7F9] hover:bg-slate-100 text-xs font-bold text-slate-700 transition-all shadow-xs shrink-0"
      >
        <Calendar className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-slate-400 font-medium">Duration:</span>
        <span className="text-slate-900 font-extrabold" data-testid="duration-active-label">
          {getDisplayLabel()}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl z-40 p-2 space-y-1"
          >
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Filter by Duration
              </span>
              {selectedKey !== "all" && (
                <button
                  type="button"
                  onClick={() => handleSelectOption(DURATION_OPTIONS[0])}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-900"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="py-1 space-y-0.5">
              {DURATION_OPTIONS.map((option) => {
                const isSelected = selectedKey === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    data-testid={`duration-option-${option.key}`}
                    onClick={() => handleSelectOption(option)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-slate-900 text-white font-bold"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Range Picker inputs when custom option is selected */}
            {selectedKey === "custom" && (
              <div className="pt-2 border-t border-slate-100 px-2 pb-1 space-y-2">
                <p className="text-[11px] font-bold text-slate-700">Select Date Range</p>
                <div className="space-y-1.5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      From Date
                    </label>
                    <input
                      type="date"
                      data-testid="duration-custom-from"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      To Date
                    </label>
                    <input
                      type="date"
                      data-testid="duration-custom-to"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="duration-custom-apply"
                  onClick={handleApplyCustom}
                  className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
                >
                  Apply Custom Range
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

