import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { API, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const processed = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const match = window.location.hash.match(/session_id=([^&]+)/);
    if (!match) {
      setError("This sign-in link is missing its session id. Please try again.");
      return;
    }
    API.post("/auth/google/session", {}, { headers: { "X-Session-ID": decodeURIComponent(match[1]) } })
      .then((r) => {
        setUser(r.data);
        window.history.replaceState({}, "", window.location.pathname);
        navigate("/", { replace: true });
      })
      .catch((e) => setError(formatApiError(e)));
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      {error ? (
        <>
          <p className="font-display font-black text-2xl text-slate-900">Sign-in hiccup</p>
          <p className="text-slate-500 font-semibold" data-testid="auth-callback-error">{error}</p>
          <button
            data-testid="auth-callback-back-btn"
            onClick={() => navigate("/", { replace: true })}
            className="mt-2 px-6 py-3 rounded-full bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-colors"
          >
            Back to Store
          </button>
        </>
      ) : (
        <>
          <Loader2 className="w-8 h-8 text-kinetic-red animate-spin" />
          <p className="font-display font-bold text-slate-900" data-testid="auth-callback-loading">
            Signing you in…
          </p>
        </>
      )}
    </div>
  );
}

