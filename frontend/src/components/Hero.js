import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ArrowLeftRight, ShieldCheck, FlaskConical, Ban } from "lucide-react";
import { scrollToSection } from "../lib/api";

const SLIDES = [
  {
    img: "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/5a5c8e5dc62bb65e98467a63c2c5b7f68bc8c85290581e11151fcb0e169504af.jpeg",
    kicker: "WHEY ISOLATE",
    title: "Kinetic Gold",
    sub: "24g protein · 0g added sugar",
  },
  {
    img: "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/f3475de57b85844fd077c2fd1ae08ecd14b9da2b13234660b88181e5db073ca4.jpeg",
    kicker: "PRE-WORKOUT",
    title: "Surge 300",
    sub: "300mg caffeine · skin-splitting pumps",
  },
  {
    img: "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/ba1969d65080a0e76e0a465b6ae52c296484c52fe4b64e52fa2f84a0334c276a.jpeg",
    kicker: "BESTSELLER",
    title: "The Gold Standard",
    sub: "Lab tested · banned-substance free",
  },
];

const EASE = [0.16, 1, 0.3, 1];

function RevealLine({ children, delay }) {
  return (
    <span className="block overflow-hidden pb-1">
      <motion.span
        className="block"
        initial={{ y: "115%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default function Hero() {
  const [index, setIndex] = useState(0);
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const glowY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  const slide = SLIDES[index];

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-white" data-testid="hero-section">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(15,23,42,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.045) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 20%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 20%, black 30%, transparent 75%)",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 lg:pt-16 lg:pb-24 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center min-h-[calc(100vh-108px)]">
        <div className="flex flex-col items-start gap-7">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="text-xs uppercase font-extrabold tracking-[0.28em] text-kinetic-red"
          >
            India's Premium Supplement Store
          </motion.p>
          <h1 className="font-display font-black text-slate-900 text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight">
            <RevealLine delay={0.2}>FUEL THE</RevealLine>
            <RevealLine delay={0.32}>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-kinetic-red to-kinetic-orange">
                RELENTLESS.
              </span>
            </RevealLine>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease: EASE }}
            className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-md"
          >
            Clinically dosed proteins, gainers and performance supplements — lab tested,
            athlete approved, delivered fast.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.68, ease: EASE }}
            className="flex flex-wrap items-center gap-3"
          >
            <button
              data-testid="hero-shop-bestsellers-btn"
              onClick={() => scrollToSection("shop")}
              className="group flex items-center gap-2 px-7 py-3.5 rounded-full bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-colors shadow-[0_12px_30px_-10px_rgba(255,59,48,0.55)]"
            >
              Shop Bestsellers
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              data-testid="hero-explore-categories-btn"
              onClick={() => scrollToSection("categories")}
              className="px-7 py-3.5 rounded-full border-2 border-slate-200 text-slate-800 font-extrabold text-sm hover:border-slate-900 transition-colors"
            >
              Explore Categories
            </button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.85 }}
            className="flex flex-wrap gap-x-6 gap-y-3 pt-2"
          >
            {[
              { icon: ShieldCheck, label: "100% Lab Tested" },
              { icon: FlaskConical, label: "Clinically Dosed" },
              { icon: Ban, label: "Zero Banned Substances" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm font-bold text-slate-600">
                <span className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-kinetic-red" />
                </span>
                {label}
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          style={{ y: imgY }}
          className="relative h-[340px] sm:h-[420px] lg:h-[560px]"
          data-testid="hero-carousel"
        >
          <motion.div
            style={{ y: glowY }}
            aria-hidden
            className="absolute -inset-8 bg-[radial-gradient(ellipse_at_center,rgba(255,107,0,0.16),transparent_65%)] blur-2xl"
          />
          <div className="relative h-full rounded-[2rem] overflow-hidden ring-1 ring-slate-900/5 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.35)]">
            <AnimatePresence mode="popLayout">
              <motion.img
                key={index}
                src={slide.img}
                alt={`${slide.title} — ${slide.sub}`}
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.8, ease: EASE }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </AnimatePresence>
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-kinetic-ink/70 via-kinetic-ink/10 to-transparent" />
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute left-5 bottom-5 right-5 flex items-end justify-between gap-4"
              >
                <div>
                  <p className="text-[10px] font-extrabold tracking-[0.3em] text-kinetic-orange uppercase">{slide.kicker}</p>
                  <p className="font-display font-black text-white text-2xl sm:text-3xl leading-tight mt-1">{slide.title}</p>
                  <p className="text-white/80 text-sm font-semibold mt-0.5">{slide.sub}</p>
                </div>
                <button
                  data-testid="hero-slide-shop-btn"
                  onClick={() => scrollToSection("shop")}
                  className="shrink-0 w-12 h-12 rounded-full bg-white text-kinetic-ink flex items-center justify-center hover:bg-kinetic-red hover:text-white transition-colors"
                  aria-label="Shop this product"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/95 backdrop-blur border border-slate-100 shadow-lg rounded-full px-3 py-2">
            <button
              data-testid="hero-prev-slide-btn"
              onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Previous slide"
            >
              <ArrowLeftRight className="w-4 h-4 text-slate-600 rotate-180" />
            </button>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                data-testid={`hero-dot-${i}`}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${i === index ? "w-7 bg-kinetic-red" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
              />
            ))}
            <button
              data-testid="hero-next-slide-btn"
              onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Next slide"
            >
              <ArrowLeftRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

