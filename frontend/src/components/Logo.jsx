export const LogoMark = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#0F172A" />
    <path d="M41 9 L20 36 h11 L26 54 L47 27 H35 Z" fill="#FF3B30" />
  </svg>
);

export default function Logo({ size = 36, onHome }) {
  return (
    <button
      data-testid="logo-home-btn"
      onClick={onHome}
      className="flex items-center gap-2.5 shrink-0"
      aria-label="Kinetic Nutrition home"
    >
      <LogoMark size={size} />
      <span className="flex flex-col items-start leading-none">
        <span className="font-display font-black text-lg tracking-tight text-slate-900">
          KINETIC
        </span>
        <span className="text-[9px] font-extrabold tracking-[0.42em] text-kinetic-red mt-0.5">
          NUTRITION
        </span>
      </span>
    </button>
  );
}

