const PATHS = {
  note: ["M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z", "M13.5 6.5l4 4"],
  board: ["M4 4h7v9H4z", "M13 4h7v5h-7z", "M13 11h7v9h-7z", "M4 15h7v5H4z"],
  flow: ["M5 6h4", "M15 6h4", "M9 6a3 3 0 0 1 6 0 3 3 0 0 1-6 0", "M12 9v6", "M9 18a3 3 0 0 1 6 0 3 3 0 0 1-6 0"],
  mic: ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z", "M5 11a7 7 0 0 0 14 0", "M12 18v3"],
  stop: ["M7 7h10v10H7z"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  moon: ["M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"],
  download: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  plus: ["M12 5v14", "M5 12h14"],
  x: ["M6 6l12 12", "M18 6L6 18"],
  check: ["M5 12.5l4.5 4.5L19 7"],
  chevron: ["M6 9l6 6 6-6"],
  alert: ["M12 4 2.5 20h19L12 4Z", "M12 10v4", "M12 17h.01"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3 2"],
  sparkle: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4"],
};

export default function Icon({ name, size = 16, className = "" }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export function Mark({ size = 28 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M12 26V6M20 26V9" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 12h4M10 19h4M18 15h4M18 21h4" stroke="var(--on-accent)" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
      <path d="M12 9c2.5-2.6 5-3 7.5-2.2M20 12c1.8-2.4 4-3.2 6-2.8" stroke="var(--on-accent)" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}
