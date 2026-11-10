import { useLocation, Link, Routes, Route } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Overview from "./Overview";
import Products from "./Products";
import Categories from "./Categories";

const NAV = [
  { key: "overview", label: "Overview", to: "/admin", icon: <LayoutDashboardIcon /> },
  { key: "products", label: "Products", to: "/admin/products", icon: <BoxIcon /> },
  { key: "categories", label: "Categories", to: "/admin/categories", icon: <ClipboardListIcon /> },
  { key: "new-arrivals", label: "New Arrivals", to: "/admin/new-arrivals", icon: <SparklesIcon /> },
  { key: "orders", label: "Orders", to: "/admin/orders", icon: <ShoppingCartIcon /> },
  { key: "payments", label: "Payments", to: "/admin/payments", icon: <CreditCardIcon /> },
  { key: "coupons", label: "Coupons", to: "/admin/coupons", icon: <TagIcon /> },
];

const LayoutDashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
);
const BoxIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 002 2h2"></path></svg>
);
const ClipboardListIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012 2m-3 7h3m-3 4h3m-9-4H9m-3-4h3m9 11l-4-4m0 0l-4-4m4 4V3"></path></svg>
);
const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M19 3v4m-2 2h4m-4 4v4m4-4h4m-4 4v4m0-4h4m-4-4v4m-4-4h4m0 4h-4m4-4V5m-4 4h4m-4 4v4m4-4h4m0-4h4m-4-4H3m4 4h4m-4 4v4m-4-4H3m4 4h4m-4-4v4m4-4H3m4-4V3m4 4v4m4-4h4"></path></svg>
);
const ShoppingCartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 0a2 2 0 100 0m0 0l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0l2.293 2.293c.63-.63 1.707-.184 1.707-.707H3m0 0l2.293 2.293c.63-.63 1.707-.184 1.707-.707H3m0 0l2.293-2.293c-.63-.63-.184-1.707-.707-1.707H3m0 0l-2.293-2.293c-.63.63-1.707.184-.707 1.707H3m0 0v4m0 0h4m4-4h4m-4 4v4m0 0h-4m4-4V3m4 4v4m4-4h4m-4 4v4m-4-4H3m4-4V3m0 0h4m4 4h-4m4-4V3m0 0l4 4m-4-4l-4 4"></path></svg>
);
const CreditCardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3"></path></svg>
);
const TagIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3m0 0l-3 3m-3-3l3-3M3 19a2 2 0 012-2h6.93c.874 0 1.679-.472 2.035-1.224l2.718-4.756c.187-.393.293-.893.293-1.457v-4.284c0-.563-.106-1.064-.293-1.457l-2.718-4.756C13.813 2.472 13.009 2 12.13 2H5a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
);

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const email = (user && user.email) || "";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Fixed dark sidebar (#090D16 = bg-kinetic-ink) */}
      <aside className="fixed inset-y-0 left-0 z-20 flex flex-col w-64 bg-kinetic-ink text-white shrink-0">
        <div className="px-6 py-8 flex-shrink-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-kinetic-red rounded-lg flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-white" />
            </div>
            <div className="font-display font-black text-xl tracking-tight">KINETIC</div>
          </motion.div>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Admin Dashboard</p>
        </div>
        <nav className="flex-1 px-4 py-3 space-y-1 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1"
          >
            {NAV.map((item, i) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  data-testid={`admin-nav-${item.key}`}
                  className={`
                    block flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200
                    ${active
                      ? "border-l-2 border-kinetic-red bg-slate-800 text-white pl-3.5"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}
                  `}
                >
                  <motion.span
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-5 h-5 shrink-0"
                  >
                    {item.icon}
                  </motion.span>
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i }}
                  >
                    {item.label}
                  </motion.span>
                </Link>
              );
            })}
          </motion.div>
        </nav>
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/40 flex-shrink-0">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Kinetic Nutrition</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden pl-64">
        <header className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              data-testid="admin-view-store"
              className="text-sm font-bold text-slate-700 hover:text-kinetic-red transition-colors"
            >
              View store <ArrowRight className="ml-1 w-3 h-3 text-slate-500" />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span data-testid="admin-email" className="hidden sm:inline text-sm font-medium text-slate-600">
              {email}
            </span>
            <button
              data-testid="admin-logout"
              onClick={() => logout()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <AnimatePresence>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              <Routes>
                <Route index element={<Overview />} />
                <Route path="products" element={<Products tab="list" />} />
                <Route path="new-arrivals" element={<Products tab="arrivals" />} />
                <Route path="categories" element={<Categories />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
