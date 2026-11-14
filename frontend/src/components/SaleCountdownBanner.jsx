import { useEffect, useState, useMemo } from "react";
import { API, scrollToSection } from "../lib/api";
import { Sparkles, Timer, Flame, ArrowRight } from "lucide-react";

function pad(num) {
  return String(Math.max(0, num)).padStart(2, "0");
}

export default function SaleCountdownBanner() {
  const [sale, setSale] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    let alive = true;

    async function checkSale() {
      try {
        const { data } = await API.get("/sales/banner");
        if (alive && data && data.active) {
          setSale(data);
        } else if (alive) {
          setSale(null);
        }
      } catch {
        // Fallback or offline: ignore
      }
    }

    checkSale();
    const interval = setInterval(checkSale, 30000); // Check every 30s
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!sale) {
      setTimeLeft(null);
      return;
    }

    function calculate() {
      const now = Date.now();
      const targetIso = sale.isLive ? sale.endsAt : sale.startsAt;
      if (!targetIso) return;
      const target = new Date(targetIso).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, expired: false });
    }

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [sale]);

  if (!sale || !timeLeft || timeLeft.expired) {
    return null;
  }

  const { isLive, percentage } = sale;
  const timeFormatted = `${timeLeft.days > 0 ? `${timeLeft.days}d : ` : ""}${pad(timeLeft.hours)}h : ${pad(timeLeft.minutes)}m : ${pad(timeLeft.seconds)}s`;

  return (
    <div
      data-testid="sale-countdown-banner"
      onClick={() => scrollToSection("sale")}
      className="relative z-40 w-full bg-black text-white py-2.5 px-4 overflow-hidden border-b border-white/10 cursor-pointer group selection:bg-kinetic-red selection:text-white"
      title="Click to view the Sale section"
    >
      <div className="sale-marquee-track flex w-max items-center">
        {[0, 1, 2].map((copy) => (
          <div
            key={copy}
            className="flex items-center gap-10 px-8 text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] whitespace-nowrap"
            aria-hidden={copy > 0}
          >
            {/* Item 1 */}
            <span className="inline-flex items-center gap-2">
              {isLive ? (
                <Flame className="w-4 h-4 text-kinetic-red animate-pulse" />
              ) : (
                <Timer className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: "6s" }} />
              )}
              <span className="text-white font-black tracking-[0.25em]">
                {isLive ? "FLASH SALE IS LIVE" : "UPCOMING FLASH SALE"}
              </span>
            </span>

            {/* Item 2: Countdown */}
            <span className="inline-flex items-center gap-2">
              <span className="text-slate-400 font-semibold">{isLive ? "ENDS IN:" : "STARTS IN:"}</span>
              <span className="font-mono font-black text-kinetic-volt bg-white/10 px-2 py-0.5 rounded tracking-wider shadow-inner">
                {timeFormatted}
              </span>
            </span>

            {/* Item 3: Grab the deal call to action */}
            <span className="inline-flex items-center gap-2 bg-gradient-to-r from-kinetic-red to-orange-500 text-white px-2.5 py-0.5 rounded-full font-black text-[11px] tracking-widest shadow-sm">
              <Sparkles className="w-3 h-3 text-white" />
              GRAB THE DEAL {percentage > 0 ? `· UP TO ${percentage}% OFF` : ""}
            </span>

            {/* Item 4 */}
            <span className="inline-flex items-center gap-1.5 text-slate-300 group-hover:text-white transition-colors">
              <span>SHOP NOW</span>
              <ArrowRight className="w-3.5 h-3.5 text-kinetic-red group-hover:translate-x-1 transition-transform" />
            </span>

            <span className="text-slate-700">✦</span>
          </div>
        ))}
      </div>
    </div>
  );
}

