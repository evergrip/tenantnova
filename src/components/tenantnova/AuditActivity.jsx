import React from "react";

export default function AuditActivity({ logs = [], title = "Recent audit activity" }) {
  return <div className="rounded-2xl border bg-white p-5"><h2 className="font-bold">{title}</h2>{logs.map(l => <div key={l.id} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><b>{l.action}</b><p className="text-slate-500">{l.reason}</p></div>)}{logs.length === 0 && <p className="mt-2 text-sm text-slate-500">No activity yet.</p>}</div>;
}