import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      navigate("/", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  return null;
}
