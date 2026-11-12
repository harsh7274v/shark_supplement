import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API } from "../lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = guest, object = logged in
  const [modal, setModal] = useState({ open: false, tab: "login" });

  useEffect(() => {
    // One-time cleanup: older builds kept tokens in localStorage, which every
    // tab shared (and any script could read). The session now lives only in
    // HttpOnly cookies, so stale keys are dropped on boot.
    localStorage.removeItem("kinetic_access_token");
    localStorage.removeItem("kinetic_refresh_token");

    if (window.location.hash?.includes("session_id=")) return;
    API.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false));
  }, []);

  const openAuth = useCallback((tab = "login") => setModal({ open: true, tab }), []);
  const closeAuth = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  const login = async (email, password) => {
    const { data } = await API.post("/auth/login", { email, password });
    setUser(data);
    closeAuth();
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await API.post("/auth/register", { name, email, password });
    setUser(data);
    closeAuth();
    return data;
  };

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } finally {
      setUser(false);
    }
  };

  const googleLogin = () => {
    const backendUrl =
      (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL) || "";
    window.location.href = `${backendUrl}/api/auth/google/start`;
  };

  return (
    <AuthContext.Provider
      value={{ user, modal, openAuth, closeAuth, login, register, logout, googleLogin, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
