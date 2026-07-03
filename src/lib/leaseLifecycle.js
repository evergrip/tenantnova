import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog, getTenantLeases } from "@/lib/tenantNova";

export const lifecycleActionTypes = ["Renewal Offer", "Move-Out Notice", "Move-Out Inspection", "Security Deposit Review", "Other"];
export const lifecycleStatuses = ["Draft", "Sent", "Tenant Accepted", "Tenant Declined", "Scheduled", "Completed", "Cancelled", "Archived"];

export async function getTenantLifecycleContext(access) {
  if (!access.tenant) return { leaseIds: [] };
  const rows = await getTenantLeases(access.organization_id, access.tenant.id);
  return { leaseIds: rows.map(r => r.lease.id) };
}

export async function getTenantLifecycleActions(access) {
  const ctx = await getTenantLifecycleContext(access);
  const records = await base44.entities.LeaseLifecycleAction.filter({ organization_id: access.organization_id }, "-created_date", 100);
  return records.filter(activeOnly).filter(a => a.tenant_id === access.tenant?.id && ctx.leaseIds.includes(a.lease_id)).filter(a => a.status !== "Draft" && a.status !== "Archived").map(({ admin_internal_note, ...safe }) => safe);
}

export async function createLifecycleAction(access, data) {
  const saved = await base44.entities.LeaseLifecycleAction.create(data);
  await createAuditLog({ organizationId: data.organization_id, user: access.user, role: access.membership.role, action: "Lease lifecycle action created", entityType: "LeaseLifecycleAction", entityId: saved.id, afterValues: saved, reason: "Admin created renewal/move-out action" });
  return saved;
}

export async function updateLifecycleAction(access, before, updates, action = "Lease lifecycle action updated") {
  const saved = await base44.entities.LeaseLifecycleAction.update(before.id, updates);
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action, entityType: "LeaseLifecycleAction", entityId: before.id, beforeValues: before, afterValues: saved, reason: action });
  return saved;
}

export async function respondToLifecycleAction(access, before, response) {
  const status = response === "Accepted" ? "Tenant Accepted" : "Tenant Declined";
  const saved = await base44.entities.LeaseLifecycleAction.update(before.id, { status, tenant_response: response, tenant_response_at: new Date().toISOString(), tenant_response_by_user_id: access.user.id });
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action: "Tenant responded to lease lifecycle action", entityType: "LeaseLifecycleAction", entityId: before.id, beforeValues: before, afterValues: saved, reason: `Tenant ${response.toLowerCase()} lifecycle action` });
  return saved;
}

export async function archiveLifecycleAction(access, before) {
  const saved = await base44.entities.LeaseLifecycleAction.update(before.id, { status: "Archived", deleted_at: new Date().toISOString() });
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action: "Lease lifecycle action archived", entityType: "LeaseLifecycleAction", entityId: before.id, beforeValues: before, afterValues: saved, reason: "Admin archived renewal/move-out action" });
  return saved;
}