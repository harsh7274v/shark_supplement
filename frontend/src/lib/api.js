import axios from "axios";

const backendUrl =
  (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL) || "";

export const API = axios.create({
  baseURL: `${backendUrl}/api`,
  withCredentials: true,
});

export function formatApiError(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && typeof d.msg === "string" ? d.msg : JSON.stringify(d)))
      .filter(Boolean)
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

export const scrollToSection = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -76 });
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
};
