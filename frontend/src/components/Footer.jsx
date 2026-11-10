import { useState } from "react";
import { motion } from "framer-motion";
import { Instagram, Twitter, Youtube, Send } from "lucide-react";
import { toast } from "sonner";
import Logo from "./Logo";

export default function Footer({ categories, onNavCategory }) {
  const [email, setEmail] = useState("");

  const subscribe = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Enter a valid email to subscribe");
      return;
    }
    toast.success("You're on the list — drop day alerts incoming.");
    setEmail("");
  };

  return (
    <footer className="relative bg-kinetic-ink text-white grain overflow-hidden" data-testid="footer">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] gap-10 pb-12 border-b border-white/10">
          <div>
            <div className="[&_span]:!text-white">
              <Logo onHome={() => window.scrollTo({ top: 0 })} />
            </div>
            <p className="text-sm text-white/60 font-semibold leading-relaxed mt-4 max-w-xs">
              Pure performance engineering for elite athletes. Lab tested, clinically dosed,
              banned-substance free — always.
            </p>
            <div className="flex gap-2 mt-5">
              {[Instagram, Twitter, Youtube].map((Icon, i) => (
                <a
                  key={i}
                  href="#top"
                  onClick={(e) => e.preventDefault()}
                  data-testid={`footer-social-${i}`}
                  className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center hover:bg-kinetic-red hover:border-kinetic-red transition-colors"
                  aria-label="Social link"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-display font-bold text-sm tracking-[0.2em] uppercase text-white/90 mb-4">Shop</h3>
            <ul className="space-y-2.5">
              {categories.map((c) => (
                <li key={c.slug}>
                  <button
                    data-testid={`footer-category-${c.slug}`}
                    onClick={() => onNavCategory(c.slug)}
                    className="text-sm font-semibold text-white/60 hover:text-white transition-colors"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display font-bold text-sm tracking-[0.2em] uppercase text-white/90 mb-4">Support</h3>
            <ul className="space-y-2.5 text-sm font-semibold text-white/60">
              {["Contact Us", "Shipping Policy", "Returns & Refunds", "Quality Guarantee", "FAQs"].map((l) => (
                <li key={l}>
                  <span className="hover:text-white transition-colors cursor-pointer">{l}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display font-bold text-sm tracking-[0.2em] uppercase text-white/90 mb-4">
              Drop Day Alerts
            </h3>
            <p className="text-sm text-white/60 font-semibold mb-3">
              New flavours, restocks and member-only pricing.
            </p>
            <form onSubmit={subscribe} className="flex gap-2" data-testid="footer-newsletter-form">
              <input
                data-testid="footer-newsletter-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-sm font-bold placeholder:text-white/40 focus:outline-none focus:border-kinetic-orange transition-colors"
              />
              <button
                type="submit"
                data-testid="footer-newsletter-submit"
                className="px-4 rounded-xl bg-kinetic-red hover:bg-kinetic-orange transition-colors flex items-center justify-center"
                aria-label="Subscribe"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex flex-wrap gap-2 mt-5">
              {["UPI", "Visa", "Mastercard", "RuPay", "COD"].map((p) => (
                <span key={p} className="px-2.5 py-1 rounded-md bg-white/10 text-[10px] font-extrabold tracking-wider">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold text-white/40">
          <p>© 2026 Kinetic Nutrition. All rights reserved.</p>
          <p>100% Lab Tested · Zero Banned Substances · Made for the Relentless</p>
        </div>
      </div>
    </footer>
  );
}

