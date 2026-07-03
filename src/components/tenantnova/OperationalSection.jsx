import React from "react";

export default function OperationalSection({ title, description, children }) {
  return <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="mb-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
    {children}
  </section>;
}