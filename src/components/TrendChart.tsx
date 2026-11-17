"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export type TrendPoint = {
  date: string;
  overall: number | null;
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  security: number | null;
};

const LINES: Array<{ key: keyof TrendPoint; color: string; label: string }> = [
  { key: "overall", color: "#4f46e5", label: "Overall" },
  { key: "performance", color: "#0ea5e9", label: "Performance" },
  { key: "seo", color: "#16a34a", label: "SEO" },
  { key: "accessibility", color: "#d97706", label: "Accessibility" },
  { key: "security", color: "#dc2626", label: "Security" },
];

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return <p className="text-sm text-[var(--text-muted)]">Run at least two audits to see a trend.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" fontSize={12} stroke="var(--text-muted)" />
        <YAxis domain={[0, 100]} fontSize={12} stroke="var(--text-muted)" />
        <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {LINES.map((line) => (
          <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={2} dot={{ r: 3 }} connectNulls name={line.label} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
