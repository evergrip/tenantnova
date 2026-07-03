import React from "react";

export default function RiskFlagList({ flags = [] }) {
  const badge = { High: "bg-red-100 text-red-700", Medium: "bg-amber-100 text-amber-800", Low: "bg-slate-100 text-slate-700" };
  if (!flags.length) return <p className="text-sm text-slate-500">No risk flags in the current dummy/test data.</p>;
  return <div className="space-y-2">
    {flags.map((flag, idx) => <div key={`${flag.label}-${idx}`} className="rounded-xl border bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge[flag.severity] || badge.Low}`}>{flag.severity}</span>
        <b>{flag.label}</b>
      </div>
      <p className="mt-1 text-slate-600">{flag.detail}</p>
    </div>)}
  </div>;
}