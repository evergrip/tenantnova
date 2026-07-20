import React from "react";
import { Link } from "react-router-dom";

export default function ApplicationCard({ app, admin = false, propertyLabel, unitLabel }) {
  const name = `${app.applicant_first_name || ""} ${app.applicant_last_name || ""}`.trim() || "Applicant";
  const propertyText = propertyLabel || (admin ? app.property_id_nullable : "—");
  const unitText = unitLabel || (admin ? app.unit_id_nullable : "—");
  return <div className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-slate-500">{app.applicant_email}</p><h3 className="text-lg font-bold">{name}</h3></div><span className="h-fit rounded-full bg-teal-100 px-3 py-1 text-sm text-teal-800">{app.application_status}</span></div><dl className="mt-4 grid gap-3 text-sm md:grid-cols-4"><div><dt className="text-slate-500">Desired move-in</dt><dd>{app.desired_move_in_date || "—"}</dd></div><div><dt className="text-slate-500">Property</dt><dd>{propertyText}</dd></div><div><dt className="text-slate-500">Unit</dt><dd>{unitText}</dd></div><div><dt className="text-slate-500">Submitted</dt><dd>{app.submitted_at?.slice(0,10) || "—"}</dd></div></dl>{app.applicant_visible_message && <p className="mt-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{app.applicant_visible_message}</p>}{admin && <Link to={`/admin/applications/${app.id}`} className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">Open review</Link>}</div>;
}