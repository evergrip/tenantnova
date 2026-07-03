import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Building2, Home, KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { resolveTenantNovaAccess } from "@/lib/tenantNova";

export default function TenantNovaLayout() {
  const [access, setAccess] = useState(null);
  const location = useLocation();

  useEffect(() => { resolveTenantNovaAccess().then(setAccess); }, []);

  if (!access) return <div className="min-h-screen grid place-items-center bg-slate-50"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" /></div>;
  if (access.status === "no_membership") return <NoMembership />;

  const adminLinks = [
    ["/admin", "Dashboard"], ["/admin/properties", "Properties & Units"], ["/admin/tenants-leases", "Tenants & Leases"],
    ["/admin/lease-participants", "Lease Participants"], ["/admin/audit-logs", "Audit Logs"], ["/admin/settings", "Organization Settings"]
  ];
  const tenantLinks = [["/tenant", "Dashboard"], ["/tenant/lease", "My Lease"], ["/tenant/profile", "Profile"], ["/tenant/contact", "Contact Manager"]];
  const links = access.isAdmin ? adminLinks : tenantLinks;

  if (location.pathname.startsWith("/admin") && !access.isAdmin) return <AccessDenied />;
  if (location.pathname.startsWith("/tenant") && !access.isTenant && !access.isAdmin) return <AccessDenied />;

  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <aside className="fixed inset-x-0 top-0 z-20 border-b bg-white lg:inset-y-0 lg:right-auto lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center gap-3 px-5"><Building2 className="text-teal-700" /><div><p className="font-bold">TenantNova</p><p className="text-xs text-slate-500">Apply. Pay. Report. Stay Compliant.</p></div></div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1">
        {links.map(([to, label]) => <NavLink key={to} to={to} end={to === "/admin" || to === "/tenant"} className={({isActive}) => `block whitespace-nowrap rounded-xl px-3 py-2 text-sm ${isActive ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</NavLink>)}
      </nav>
      <button onClick={() => base44.auth.logout("/login")} className="hidden items-center gap-2 px-6 py-3 text-sm text-slate-500 lg:flex"><LogOut size={16} /> Sign out</button>
    </aside>
    <main className="px-4 pb-10 pt-24 lg:ml-72 lg:p-8"><Outlet context={access} /></main>
  </div>;
}

function NoMembership() {
  return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm"><KeyRound className="mx-auto mb-4 text-teal-700" /><h1 className="text-2xl font-bold">Access not configured</h1><p className="mt-3 text-slate-600">Your account does not have an active TenantNova organization membership, so no organization data is shown.</p><Link to="/login" className="mt-6 inline-block rounded-xl bg-teal-700 px-4 py-2 text-white">Back to login</Link></div></div>;
}

function AccessDenied() {
  return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm"><ShieldAlert className="mx-auto mb-4 text-red-600" /><h1 className="text-2xl font-bold">Access denied</h1><p className="mt-3 text-slate-600">This area is restricted by your active OrganizationMembership role.</p><Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-white"><Home size={16} /> Go home</Link></div></div>;
}