import React from "react";
import { Navigate, useOutletContext } from "react-router-dom";

export default function Home() {
  const access = useOutletContext();
  if (access?.isAdmin) return <Navigate to="/admin" replace />;
  if (access?.isTenant) return <Navigate to="/tenant" replace />;
  if (access?.isApplicant) return <Navigate to="/applicant/application" replace />;
  return <div className="rounded-2xl border bg-white p-6">TenantNova access is not configured.</div>;
}