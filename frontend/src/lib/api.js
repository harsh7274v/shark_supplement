import axios from "axios";

const backendUrl =
  (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL) || "";

export const API = axios.create({
  baseURL: `${backendUrl}/api`,
  withCredentials: true,
});

/**
 * The session lives in HttpOnly cookies only — never in localStorage — so
 * every tab of the browser shares exactly one server-side session and no
 * script can read a token. When an access token expires (15 min), one silent
 * refresh through the refresh cookie retries the original call once.
 */
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config;
    const url = original?.url || "";
    const isAuthCall =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");
    if (
      error?.response?.status === 401 &&
      original &&
      !isAuthCall &&
      !original._retry
    ) {
      original._retry = true;
      try {
        await axios.post(`${backendUrl}/api/auth/refresh`, null, {
          withCredentials: true,
        });
        return API(original);
      } catch {
        // The refresh cookie is gone too: the caller sees the 401 and the
        // auth context drops to guest on its next /auth/me check.
      }
    }
    return Promise.reject(error);
  }
);

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

/** Rupees → integer paise (mirrors the server-side `toPaise` money util). */
export const toPaise = (n) => Math.round(Number(n) * 100);

/**
 * Reads a `datetime-local` value (a date and time without seconds, IST)
 * and returns it as a UTC ISO string. An empty or unparseable value reads as
 * an empty string, so a form that was never filled does not crash the save.
 */
export function istToUtc(local) {
  if (typeof local !== "string" || local.trim() === "") {
    return "";
  }
  const parsed = new Date(`${local.trim()}:00+05:30`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
}

/**
 * Formats a UTC ISO string in IST for the display of a sale window: the date
 * and the time of day in India, with the IST suffix. An empty or unparseable
 * value reads as an empty string.
 */
export function fmtIst(iso) {
  if (typeof iso !== "string" || iso.trim() === "") {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const day = date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day}, ${time} IST`;
}

export const scrollToSection = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -76 });
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
};
