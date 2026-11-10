import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag, Menu, X, ChevronDown, LogOut, UserRound, Package } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { scrollToSection } from "../lib/api";
import Logo from "./Logo";

const NAV_LINKS = [
  { label: "Shop All", category: "all" },
  { label: "New Arrivals", category: null, target: "new-arrivals" },
  { label: "Proteins", category: "proteins" },
  { label: "Pre/Post Workout", category: "pre_post" },
  { label: "Ayurveda", category: "ayurveda" },
  { label: "Fat Loss", category: "fat_loss" },
];

export default function Header({ onNavCategory }) {
  const { user, openAuth, logout } = useAuth();
  const { count, setCartOpen } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const navigate = useNavigate();

  const go = (link) => {
    setMenuOpen(false);
    if (link.target) scrollToSection(link.target);
    else onNavCategory(link.category);
  };

  return (
    <div className="sticky top-0 z-50">
      <div className="bg-kinetic-ink text-white text-[11px] font-bold tracking-[0.18em] uppercase text-center py-2 px-4">
        Free express shipping over ₹999 · Use code <span className="text-kinetic-orange">KINETIC10</span> for 10% off
      </div>
      <header className="backdrop-blur-xl bg-white/85 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Logo onHome={() => go({ target: "top" })} />

          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                data-testid={`nav-link-${link.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                onClick={() => go(link)}
                className="px-3.5 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-50 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              data-testid="cart-toggle-button"
              onClick={() => setCartOpen(true)}
              className="relative p-2.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Open cart"
            >
              <ShoppingBag className="w-5 h-5 text-slate-800" strokeWidth={2.2} />
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  data-testid="cart-count-badge"
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-kinetic-red text-white text-[10px] font-extrabold flex items-center justify-center"
                >
                  {count}
                </motion.span>
              )}
            </button>

            {user === null ? (
              <div className="w-24 h-10 rounded-full bg-slate-100 animate-pulse" />
            ) : user ? (
              <div className="relative">
                <button
                  data-testid="user-menu-button"
                  onClick={() => setUserMenu((v) => !v)}
                  className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  {user.picture ? (
                    <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-kinetic-ink text-white text-sm font-extrabold flex items-center justify-center">
                      {user.name?.[0]?.toUpperCase() || "K"}
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                </button>
                <AnimatePresence>
                  {userMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.97 }}
                      transition={{ duration: 0.18 }}
                      className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50"
                      data-testid="user-dropdown"
                    >
                      <div className="px-3 py-2">
                        <p className="text-sm font-extrabold text-slate-900 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                      <button
                        data-testid="my-orders-link"
                        onClick={() => { setUserMenu(false); navigate("/my-orders"); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                      >
                        <Package className="w-4 h-4" /> My Orders
                      </button>
                      {user.role === "admin" && (
                        <button
                          data-testid="admin-dashboard-link"
                          onClick={() => { setUserMenu(false); navigate("/admin"); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                          Admin Dashboard
                        </button>
                      )}
                      <button
                        data-testid="logout-button"
                        onClick={() => { setUserMenu(false); logout(); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                      >
                        <LogOut className="w-4 h-4" /> Log out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                data-testid="login-signup-button"
                onClick={() => openAuth("login")}
                className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full bg-kinetic-ink text-white text-sm font-extrabold hover:bg-slate-800 transition-colors"
              >
                <UserRound className="w-4 h-4" />
                Login / Signup
              </button>
            )}

            <button
              data-testid="mobile-menu-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden p-2.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden overflow-hidden border-t border-slate-100 bg-white"
              data-testid="mobile-menu"
            >
              <div className="px-4 py-3 flex flex-col">
                {NAV_LINKS.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => go(link)}
                    className="text-left px-3 py-3 text-sm font-bold text-slate-700 rounded-xl hover:bg-slate-50"
                  >
                    {link.label}
                  </button>
                ))}
                {!user && (
                  <button
                    data-testid="mobile-login-button"
                    onClick={() => { setMenuOpen(false); openAuth("login"); }}
                    className="mt-2 px-4 py-3 rounded-full bg-kinetic-ink text-white text-sm font-extrabold"
                  >
                    Login / Signup
                  </button>
                )}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
    </div>
  );
}

