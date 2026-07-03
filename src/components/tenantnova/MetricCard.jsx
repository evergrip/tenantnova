import React from "react";

export default function MetricCard({ label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-white text-slate-900",
    teal: "bg-teal-50 text-teal-900 border-teal-100",
    amber: "bg-amber-50 text-amber-900 border-amber-100",
    red: "bg-red-50 text-red-900 border-red-100"
  };
  return <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
    <p className="text-2xl font-bold">{value}</p>
    <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
  </div>;
}