import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Building2, Home, KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createAuditLog, resolveTenantNovaAccess } from "@/lib/tenantNova";
import { useAuth } from "@/lib/AuthContext";

export default function TenantNovaLayout() {
  const [access, setAccess] = useState(null);
  const location = useLocation();
  const { isAuthenticated, authChecked, navigateToLogin } = useAuth();

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }
    let cancelled = false;
    resolveTenantNovaAccess()
      .then((nextAccess) => { if (!cancelled) setAccess(nextAccess); })
      .catch(() => { if (!cancelled) setAccess({ status: "error" }); });
    return () => { cancelled = true; };
  }, [authChecked, isAuthenticated, navigateToLogin]);
  useEffect(() => {
    if (access?.status !== "ready" || !location.pathname.startsWith("/admin")) return;
    const isReadinessPath = location.pathname.startsWith("/admin/readiness") || location.pathname.startsWith("/admin/integration-readiness") || location.pathname.startsWith("/admin/production-hardening") || location.pathname.startsWith("/admin/security-review");
    const isCommandCenterPath = location.pathname.startsWith("/admin/notifications") || location.pathname.startsWith("/admin/tasks") || isReadinessPath;
    if (isReadinessPath && !access.isCommandCenterUser) {
      createAuditLog({ organizationId: access.organization.id, user: access.user, role: access.membership?.role, action: "Unauthorized readiness access attempt", entityType: "ReadinessControlRoom", entityId: "readiness-access", reason: "Non-admin/staff attempted to access Phase 1J readiness screens" });
    } else if (isCommandCenterPath && !access.isCommandCenterUser) {
      createAuditLog({ organizationId: access.organization.id, user: access.user, role: access.membership?.role, action: "Unauthorized notification/task access attempt", entityType: "InternalCommandCenter", entityId: "notification-task-access", reason: "Non-admin/staff attempted to access Phase 1I notification or task queue" });
    } else if (!isCommandCenterPath && !access.isAdmin) {
      createAuditLog({ organizationId: access.organization.id, user: access.user, role: access.membership?.role, action: "Unauthorized dashboard access attempt", entityType: "OperationalDashboard", entityId: "admin-dashboard", reason: "Non-admin attempted to access admin operational dashboard" });
    }
  }, [access?.status, access?.isAdmin, access?.isCommandCenterUser, location.pathname]);

  if (!access) return <div className="min-h-screen grid place-items-center bg-slate-50"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" /></div>;
  if (access.status === "error") return <AccessLoadError />;
  if (access.status === "no_membership") return <NoMembership />;

  const adminLinks = [
    ["/admin", "Dashboard"], ["/admin/properties", "Properties & Units"], ["/admin/tenants-leases", "Tenants & Leases"],
    ["/admin/lease-participants", "Lease Participants"], ["/admin/ledger", "Portfolio Ledger"], ["/admin/arrears", "Arrears"], ["/admin/documents", "Document Center"], ["/admin/maintenance", "Maintenance"], ["/admin/inspections", "Inspections"], ["/admin/applications", "Applications"], ["/admin/forms-library", "Forms Library"], ["/admin/compliance-rules", "Compliance Rules"], ["/admin/form-workflows", "Form Workflows"], ["/admin/investor-reports", "Investor Reports"], ["/admin/notifications", "Notification Center"], ["/admin/tasks", "Task Queue"], ["/admin/readiness", "Readiness Dashboard"], ["/admin/integration-readiness", "Integration Readiness"], ["/admin/production-hardening", "Production Hardening"], ["/admin/security-review", "Security Review"], ["/admin/audit-logs", "Audit Logs"], ["/admin/settings", "Organization Settings"]
  ];
  const commandCenterLinks = [["/admin/notifications", "Notification Center"], ["/admin/tasks", "Task Queue"], ["/admin/readiness", "Readiness Dashboard"], ["/admin/integration-readiness", "Integration Readiness"], ["/admin/production-hardening", "Production Hardening"], ["/admin/security-review", "Security Review"]];
  const tenantLinks = [["/tenant", "Dashboard"], ["/tenant/lease", "My Lease"], ["/tenant/ledger", "Rent Ledger & Payments"], ["/tenant/documents", "Documents"], ["/tenant/maintenance", "Maintenance"], ["/tenant/inspections", "Inspections"], ["/tenant/forms-notices", "Forms & Notices"], ["/tenant/profile", "Profile"], ["/tenant/contact", "Contact Manager"]];
  const applicantLinks = [["/applicant/application", "My Application"]];
  const links = access.isAdmin ? adminLinks : access.isCommandCenterUser ? commandCenterLinks : access.isTenant && access.isApplicant ? [...tenantLinks, ...applicantLinks] : access.isApplicant ? applicantLinks : tenantLinks;
  const tenantSafeOrganization = access.organization ? {
    organization_name: access.organization.name,
    logo: access.organization.logo,
    primary_color: access.organization.primary_color,
    support_email: access.organization.support_email,
    support_phone: access.organization.support_phone
  } : null;
  const outletAccess = access.isTenant
    ? { ...access, organization_id: access.organization.id, organization: tenantSafeOrganization }
    : { ...access, organization_id: access.organization.id };

  const isReadinessPath = location.pathname.startsWith("/admin/readiness") || location.pathname.startsWith("/admin/integration-readiness") || location.pathname.startsWith("/admin/production-hardening") || location.pathname.startsWith("/admin/security-review");
  const isCommandCenterPath = location.pathname.startsWith("/admin/notifications") || location.pathname.startsWith("/admin/tasks") || isReadinessPath;
  if (location.pathname.startsWith("/admin") && (isCommandCenterPath ? !access.isCommandCenterUser : !access.isAdmin)) return <AccessDenied />;
  if (location.pathname.startsWith("/tenant") && !access.isTenant && !access.isAdmin) return <AccessDenied />;
  if (location.pathname.startsWith("/applicant") && !access.isApplicant) return <AccessDenied />;

  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <aside className="fixed inset-x-0 top-0 z-20 border-b bg-white lg:inset-y-0 lg:right-auto lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center gap-3 px-5"><Building2 className="text-teal-700" /><div><p className="font-bold">TenantNova</p><p className="text-xs text-slate-500">Apply. Pay. Report. Stay Compliant.</p></div></div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1">
        {links.map(([to, label]) => <NavLink key={to} to={to} end={to === "/admin" || to === "/tenant"} className={({isActive}) => `block whitespace-nowrap rounded-xl px-3 py-2 text-sm ${isActive ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</NavLink>)}
      </nav>
      <button onClick={() => base44.auth.logout("/login")} className="hidden items-center gap-2 px-6 py-3 text-sm text-slate-500 lg:flex"><LogOut size={16} /> Sign out</button>
    </aside>
    <main className="px-4 pb-10 pt-24 lg:ml-72 lg:p-8"><Outlet context={outletAccess} /></main>
  </div>;
}

function NoMembership() {
  return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm"><KeyRound className="mx-auto mb-4 text-teal-700" /><h1 className="text-2xl font-bold">Access not configured</h1><p className="mt-3 text-slate-600">Your account does not have an active TenantNova organization membership, so no organization data is shown.</p><Link to="/login" className="mt-6 inline-block rounded-xl bg-teal-700 px-4 py-2 text-white">Back to login</Link></div></div>;
}

function AccessLoadError() {
  return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm"><ShieldAlert className="mx-auto mb-4 text-red-600" /><h1 className="text-2xl font-bold">Unable to load access</h1><p className="mt-3 text-slate-600">Please sign in again or contact an administrator to confirm your TenantNova membership.</p><button onClick={() => base44.auth.redirectToLogin(window.location.href)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-white">Sign in again</button></div></div>;
}

function AccessDenied() {
  return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm"><ShieldAlert className="mx-auto mb-4 text-red-600" /><h1 className="text-2xl font-bold">Access denied</h1><p className="mt-3 text-slate-600">This area is restricted by your active OrganizationMembership role.</p><Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-white"><Home size={16} /> Go home</Link></div></div>;
}