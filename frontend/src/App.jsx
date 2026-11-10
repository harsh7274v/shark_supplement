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

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));

function MyOrders() {
  return <div className="min-h-screen bg-white py-12 px-6 text-center"><h2 className="font-display font-bold text-2xl text-slate-900">My Orders</h2><p className="text-slate-500 mt-2">Your order history will appear here.</p></div>;
}

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white px-8 text-center">
          <p className="font-display font-black text-3xl text-slate-900">Something snapped.</p>
          <p className="text-slate-500 font-semibold">Reload the page to get back to training.</p>
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
    if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
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
          user !== null && user !== false && user.role === "admin" ? (
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

