function colorFor(score: number): string {
  if (score >= 90) return "var(--good)";
  if (score >= 70) return "var(--warn)";
  return "var(--bad)";
}

export function ScoreRing({ score, label, size = 96 }: { score: number | null; label: string; size?: number }) {
  const value = score ?? 0;
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = score == null ? "var(--text-muted)" : colorFor(value);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={8} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeDasharray={circumference}
            strokeDashoffset={score == null ? circumference : offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold">
          {score == null ? "—" : Math.round(score)}
        </div>
      </div>
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
