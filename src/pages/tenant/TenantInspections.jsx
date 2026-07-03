import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import InspectionReportCard from "@/components/tenantnova/InspectionReportCard";
import { listTenantInspections } from "@/lib/phase1d";

export default function TenantInspections() {
  const access = useOutletContext();
  const [rows, setRows] = useState([]);
  useEffect(() => { if (access.tenant) listTenantInspections(access).then(setRows); }, [access]);
  if (!access.tenant) return <div className="rounded-2xl border bg-white p-6">No tenant profile is linked to this account.</div>;
  return <section><h1 className="text-3xl font-bold">Inspections</h1><p className="mt-2 text-slate-600">View shared inspection reports for leases you can access. Unshared reports and internal admin notes are hidden.</p><div className="mt-6 grid gap-4">{rows.map(r => <InspectionReportCard key={r.id} report={r} />)}{rows.length === 0 && <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">No shared inspections available.</div>}</div></section>;
}