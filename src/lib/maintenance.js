import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog, getTenantLeases } from "@/lib/tenantNova";

export const maintenanceCategories = ["Plumbing", "Electrical", "Heating", "Appliance", "Pest", "Safety", "General", "Other"];
export const maintenancePriorities = ["Low", "Medium", "High", "Emergency"];
export const maintenanceStatuses = ["Submitted", "Under Review", "Scheduled", "In Progress", "Waiting On Tenant", "Completed", "Closed", "Cancelled"];

export async function getTenantMaintenanceContext(access) {
  if (!access.tenant) return { leaseIds: [], propertyIds: [], unitIds: [] };
  const rows = await getTenantLeases(access.organization_id, access.tenant.id);
  return {
    leaseIds: rows.map(r => r.lease.id),
    propertyIds: rows.map(r => r.lease.property_id),
    unitIds: rows.map(r => r.lease.unit_id)
  };
}

export async function getTenantMaintenanceRequests(access) {
  const ctx = await getTenantMaintenanceContext(access);
  const records = await base44.entities.MaintenanceRequest.filter({ organization_id: access.organization_id }, "-created_date", 100);
  return records.filter(activeOnly).filter(r => r.tenant_id === access.tenant?.id && ctx.leaseIds.includes(r.lease_id));
}

export async function createMaintenanceRequest(access, data, roleLabel = "Tenant") {
  const saved = await base44.entities.MaintenanceRequest.create(data);
  await createAuditLog({ organizationId: data.organization_id, user: access.user, role: access.membership.role, action: `${roleLabel} maintenance request created`, entityType: "MaintenanceRequest", entityId: saved.id, afterValues: saved, reason: `${roleLabel} created maintenance request` });
  return saved;
}

export async function updateMaintenanceRequest(access, before, updates) {
  const saved = await base44.entities.MaintenanceRequest.update(before.id, updates);
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action: "Maintenance request updated", entityType: "MaintenanceRequest", entityId: before.id, beforeValues: before, afterValues: saved, reason: "Maintenance status or details updated" });
  return saved;
}

export async function archiveMaintenanceRequest(access, before) {
  const saved = await base44.entities.MaintenanceRequest.update(before.id, { deleted_at: new Date().toISOString(), status: "Closed" });
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action: "Maintenance request archived", entityType: "MaintenanceRequest", entityId: before.id, beforeValues: before, afterValues: saved, reason: "Admin archived maintenance request" });
  return saved;
}