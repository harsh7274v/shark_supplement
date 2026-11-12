import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { API } from "../lib/api";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    // The worker signs the customer in with HttpOnly cookies and redirects
    // here with `?login=success`; no token ever travels in the URL.
    if (new URLSearchParams(window.location.search).get("login") === "success") {
      API.get("/auth/me")
        .then((r) => setUser(r.data))
        .catch(() => setUser(false))
        .finally(() => {
          window.history.replaceState({}, "", window.location.pathname);
          navigate("/", { replace: true });
        });
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate, setUser]);

  return null;
}
