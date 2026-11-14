import { useLocation, Link, Routes, Route } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Sparkles,
  ShoppingBag,
  CreditCard,
  Ticket,
  BadgePercent,
  LogOut,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Store,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Overview from "./Overview";
import Products from "./Products";
import Categories from "./Categories";
import Orders from "./Orders";
import Payments from "./Payments";
import Coupons from "./Coupons";
import Sales from "./Sales";

const NAV = [
  { key: "overview", label: "Overview", to: "/admin", icon: LayoutDashboard },
  { key: "products", label: "Products", to: "/admin/products", icon: Package },
  { key: "categories", label: "Categories", to: "/admin/categories", icon: FolderTree },
  { key: "new-arrivals", label: "New Arrivals", to: "/admin/new-arrivals", icon: Sparkles },
  { key: "sales", label: "Sales", to: "/admin/sales", icon: BadgePercent },
  { key: "orders", label: "Orders", to: "/admin/orders", icon: ShoppingBag },
  { key: "payments", label: "Payments", to: "/admin/payments", icon: CreditCard },
  { key: "coupons", label: "Coupons", to: "/admin/coupons", icon: Ticket },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const email = (user && user.email) || "";

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-800 font-sans selection:bg-slate-900 selection:text-white relative">
      {/* Full white sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm shrink-0">
        <div className="px-5 py-6 flex-shrink-0">
          <Link to="/admin" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 text-white flex items-center justify-center shadow-md shadow-slate-900/20 group-hover:scale-105 transition-transform duration-200">
              <ShieldCheck className="w-5 h-5 text-kinetic-red" />
            </div>
            <div>
              <span className="font-display font-black text-lg tracking-tight text-slate-900 block leading-tight">
                TOM NUTRITION
              </span>
              <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-slate-400 block">
                Admin Console
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto kinetic-scroll" data-lenis-prevent>
          <div className="px-3 pb-2 pt-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
              Management
            </p>
          </div>
          {NAV.map((item) => {
            const active =
              location.pathname === item.to ||
              (item.to !== "/admin" && location.pathname.startsWith(`${item.to}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.key}
                to={item.to}
                data-testid={`admin-nav-${item.key}`}
                className={`
                  group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 relative
                  ${
                    active
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/15"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  }
                `}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-[#F6F7F9] text-slate-500 group-hover:bg-white group-hover:text-slate-900 shadow-xs border border-slate-200/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="truncate">{item.label}</span>
                {active ? (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-kinetic-red shadow-sm" />
                ) : (
                  <ChevronRight className="ml-auto w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200 bg-white flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-500">Live Environment</span>
          </div>
          <span className="text-[10px] font-bold text-slate-400">v2.4</span>
        </div>
      </aside>

      {/* Main page content area - Full white background in middle */}
      <div className="flex-1 flex flex-col overflow-hidden pl-64 relative z-10 bg-white">
        {/* Full white header */}
        <header className="sticky top-0 z-20 flex flex-shrink-0 items-center justify-between px-8 py-3.5 bg-white border-b border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              data-testid="admin-view-store"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F6F7F9] hover:bg-slate-100 text-xs font-extrabold text-slate-700 hover:text-slate-900 border border-slate-200 shadow-xs transition-all"
            >
              <Store className="w-3.5 h-3.5 text-kinetic-red" />
              <span>View storefront</span>
              <ExternalLink className="w-3 h-3 text-slate-400 ml-0.5" />
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <div
              data-testid="admin-email"
              className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F6F7F9] border border-slate-200 shadow-xs text-xs font-semibold text-slate-700"
            >
              <div className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center">
                {email ? email[0].toUpperCase() : "A"}
              </div>
              <span className="max-w-[190px] truncate">{email}</span>
            </div>
            <button
              data-testid="admin-logout"
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/70 shadow-xs transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </header>

        {/* Scrollable workspace - Pure white canvas */}
        <main
          className="flex-1 overflow-y-auto kinetic-scroll relative z-10 bg-white"
          data-lenis-prevent
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname.startsWith("/admin/orders") ? "/admin/orders" : location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="p-8 max-w-7xl mx-auto"
            >
              <Routes location={location}>
                <Route index element={<Overview />} />
                <Route path="products" element={<Products tab="list" />} />
                <Route path="new-arrivals" element={<Products tab="arrivals" />} />
                <Route path="sales" element={<Sales />} />
                <Route path="categories" element={<Categories />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/:id" element={<Orders />} />
                <Route path="payments" element={<Payments />} />
                <Route path="coupons" element={<Coupons />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
