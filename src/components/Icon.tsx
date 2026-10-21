// Λίγα εικονίδια, πάντα με σαφή σημασία (ανασχεδιασμός 13/10). Γραμμικά, παίρνουν το χρώμα του κειμένου.
const PATHS: Record<string, string> = {
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  group: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 0a3 3 0 1 0 0-6M3 20a6 6 0 0 1 12 0m1-5a5 5 0 0 1 5 5",
  video: "M4 7h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm12 4 5-3v8l-5-3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  doc: "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6m-6 4h6",
  alert: "M12 3 2 20h20L12 3Zm0 7v4m0 3v.5",
  chat: "M4 5h16v11H9l-5 4V5Z",
  check: "m5 12 5 5L20 7",
  calendar: "M4 6h16v14H4V6Zm0 5h16M8 3v4m8-4v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  leaf: "M5 19C5 9 11 5 20 4c0 9-4 15-14 15Zm0 0 7-7",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-3v-1",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.5-4.5",
  chevron: "m9 6 6 6-6 6",
  back: "m15 6-6 6 6 6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-8v.5",
  save: "M5 3h11l3 3v15H5V3Zm3 0v6h7V3M8 21v-7h8v7",
  chart: "M5 20v-8m7 8V5m7 15v-5",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  "eye-off": "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  home: "M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z",
  menu: "M4 7h16M4 12h16M4 17h16",
};

export function Icon({ name, size = 20, className, label }: { name: keyof typeof PATHS | string; size?: number; className?: string; label?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      focusable="false"
    >
      {label && <title>{label}</title>}
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}
