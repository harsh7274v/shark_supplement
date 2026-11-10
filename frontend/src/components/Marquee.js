const ITEMS = [
  "100% PURE ISOLATE",
  "ZERO BANNED SUBSTANCES",
  "CLINICALLY DOSED",
  "FAST ABSORPTION",
  "PREMIUM INGREDIENTS",
];

const Diamond = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" className="text-kinetic-red" aria-hidden="true">
    <rect x="1.7" y="1.7" width="6.6" height="6.6" rx="1.2" transform="rotate(45 5 5)" fill="currentColor" />
  </svg>
);

export default function Marquee() {
  return (
    <section className="relative bg-kinetic-ink text-white py-5 overflow-hidden grain" aria-label="Store values">
      <div className="kinetic-marquee-track flex w-max">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {ITEMS.map((item) => (
              <span
                key={`${copy}-${item}`}
                className="flex items-center gap-8 px-8 font-display font-extrabold text-sm sm:text-base tracking-[0.3em] whitespace-nowrap"
              >
                {item}
                <Diamond />
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

