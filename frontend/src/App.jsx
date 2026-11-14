import { Component, useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import Lenis from "lenis";
import "@/App.css";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { useAuth } from "./context/AuthContext";
import Home from "./pages/Home";
import AuthCallback from "./pages/AuthCallback";
import MyOrders from "./pages/MyOrders";

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white px-8 text-center">
          <p className="font-display font-black text-3xl text-slate-900">Something snapped.</p>
          <p className="text-slate-500 font-semibold">Reload the page to get back to training.</p>
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-left max-w-2xl w-full">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Error details</p>
            <pre className="text-xs font-mono text-red-600 whitespace-pre-wrap break-all">
              {this.state.error?.message || String(this.state.error)}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function SmoothScroll() {
  const location = useLocation();
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    window.__lenis = lenis;
    let raf;
    const loop = (t) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      window.__lenis = null;
    };
  }, []);
  useEffect(() => {
    if (window.__lenis) {
      if (location.pathname.startsWith("/admin")) {
        window.__lenis.stop();
      } else {
        window.__lenis.start();
        window.__lenis.scrollTo(0, { immediate: true });
      }
    } else if (!location.pathname.startsWith("/admin")) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);
  return null;
}

function AppRouter() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/my-orders" element={<MyOrders />} />
      <Route
        path="/admin/*"
        element={
          user === null ? (
            <div className="min-h-screen flex flex-col items-center justify-center bg-kinetic-ink text-white gap-3">
              <div className="w-8 h-8 border-4 border-kinetic-red border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm font-semibold">Verifying admin access…</p>
            </div>
          ) : user && user.role === "admin" ? (
            <Suspense fallback={null}>
              <AdminLayout />
            </Suspense>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <SmoothScroll />
            <AppRouter />
            <Toaster position="bottom-right" richColors closeButton />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

