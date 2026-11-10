import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Mail, Lock, UserRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { API, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const EASE = [0.16, 1, 0.3, 1];

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.9-2.9z" />
    <path fill="#EA4335" d="M12 4.7c2.3 0 3.8.9 4.7 1.8l3.4-3.3C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.9 2.9c.9-3 3.6-5 6.8-5z" />
  </svg>
);

export default function AuthModal() {
  const { modal, openAuth, closeAuth, login, register, googleLogin } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const tab = modal.tab;
  const close = () => { closeAuth(); setError(null); setNotice(null); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = tab === "login"
        ? await login(form.email, form.password)
        : await register(form.name, form.email, form.password);
      toast.success(`Welcome to Kinetic, ${u.name?.split(" ")[0] || "athlete"}`);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await API.post("/auth/forgot-password", { email: form.email });
      setNotice("If that email is registered, a reset link is on its way.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {modal.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-kinetic-ink/55 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={close}
          data-testid="auth-modal"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 sm:p-8"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="font-display font-black text-2xl text-slate-900">
                  {tab === "login" ? "Welcome back." : "Join the team."}
                </h2>
                <p className="text-sm text-slate-500 font-semibold mt-1">
                  {tab === "login" ? "Sign in to track orders and unlock member pricing." : "Create an account in seconds."}
                </p>
              </div>
              <button
                data-testid="auth-modal-close-button"
                onClick={close}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex gap-1 p-1 rounded-full bg-slate-100 mb-6" data-testid="auth-tab-switcher">
              {["login", "signup"].map((t) => (
                <button
                  key={t}
                  data-testid={`auth-tab-${t}`}
                  onClick={() => { setError(null); setNotice(null); openAuth(t); }}
                  className={`flex-1 py-2.5 rounded-full text-sm font-extrabold transition-all ${
                    tab === t ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t === "login" ? "Login" : "Sign Up"}
                </button>
              ))}
            </div>

            <button
              data-testid="auth-modal-google-btn"
              onClick={googleLogin}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl border-2 border-slate-200 font-extrabold text-sm text-slate-800 hover:border-slate-400 transition-colors"
            >
              <GoogleG /> Continue with Google
            </button>
            <div className="flex items-center gap-3 my-5">
              <span className="flex-1 h-px bg-slate-100" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">or with email</span>
              <span className="flex-1 h-px bg-slate-100" />
            </div>

            {notice ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm font-bold text-emerald-700" data-testid="auth-notice">
                {notice}
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3.5">
                {tab === "signup" && (
                  <div className="relative">
                    <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      data-testid="auth-input-name"
                      value={form.name}
                      onChange={set("name")}
                      placeholder="Full name"
                      required
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-slate-200 text-sm font-bold placeholder:font-semibold placeholder:text-slate-400 focus:border-kinetic-red focus:outline-none transition-colors"
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    data-testid="auth-input-email"
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="Email address"
                    required
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-slate-200 text-sm font-bold placeholder:font-semibold placeholder:text-slate-400 focus:border-kinetic-red focus:outline-none transition-colors"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    data-testid="auth-input-password"
                    type="password"
                    value={form.password}
                    onChange={set("password")}
                    placeholder={tab === "signup" ? "Password (min 6 characters)" : "Password"}
                    required
                    minLength={6}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-slate-200 text-sm font-bold placeholder:font-semibold placeholder:text-slate-400 focus:border-kinetic-red focus:outline-none transition-colors"
                  />
                </div>
                {tab === "login" && (
                  <button
                    type="button"
                    data-testid="forgot-password-trigger"
                    onClick={forgot}
                    className="text-xs font-extrabold text-kinetic-red hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
                {error && (
                  <p className="text-sm font-bold text-kinetic-red bg-red-50 rounded-xl px-4 py-3" data-testid="auth-error">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  data-testid="auth-submit-button"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-kinetic-red text-white font-extrabold hover:bg-kinetic-orange transition-colors disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {tab === "login" ? "Login" : "Create Account"}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

