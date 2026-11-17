import clsx from "clsx";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-[color-mix(in_srgb,var(--critical)_18%,transparent)] text-[var(--critical)] border-[var(--critical)]/30",
  high: "bg-[color-mix(in_srgb,var(--bad)_16%,transparent)] text-[var(--bad)] border-[var(--bad)]/30",
  medium: "bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-[var(--warn)] border-[var(--warn)]/30",
  low: "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)] border-[var(--accent)]/30",
  info: "bg-[color-mix(in_srgb,var(--text-muted)_16%,transparent)] text-[var(--text-muted)] border-[var(--text-muted)]/30",
  open: "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)] border-[var(--warn)]/30",
  fixed: "bg-[color-mix(in_srgb,var(--good)_16%,transparent)] text-[var(--good)] border-[var(--good)]/30",
  ignored: "bg-[color-mix(in_srgb,var(--text-muted)_14%,transparent)] text-[var(--text-muted)] border-[var(--text-muted)]/30",
};

export function Badge({ children, tone = "info", className }: { children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        SEVERITY_STYLES[tone] ?? SEVERITY_STYLES.info,
        className,
      )}
    >
      {children}
    </span>
  );
}
