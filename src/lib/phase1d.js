import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog, getTenantLeases } from "@/lib/tenantNova";
import { invokeTenantNovaSecurityBoundary, sanitizeTenantPayload } from "@/lib/security";

export const maintenanceCategories = ["Plumbing", "Electrical", "HVAC", "Appliance", "Structural", "Pest", "Exterior", "Safety", "Cosmetic", "Other"];
export const maintenancePriorities = ["Emergency", "Urgent", "Routine", "Low"];
export const maintenanceStatuses = ["Submitted", "Acknowledged", "Assigned", "Scheduled", "In Progress", "Completed", "Tenant Confirmation", "Closed", "Reopened"];
export const inspectionTypes = ["Move-In", "Move-Out", "Periodic", "Maintenance", "Other"];
export const splitRefs = (v) => (v || "").split(",").map(s => s.trim()).filter(Boolean);
export const refsText = (arr) => Array.isArray(arr) ? arr.join(", ") : "";
export const parseJson = (v) => { try { return v ? JSON.parse(v) : {}; } catch { return {}; } };
export const asJsonText = (v) => JSON.stringify(v || {}, null, 2);

export async function tenantContext(access) {
  if (!access?.tenant) return { leases: [], leaseIds: [], propertyIds: [], unitIds: [] };
  const rows = await getTenantLeases(access.organization_id, access.tenant.id);
  return { leases: rows.map(r => r.lease), leaseIds: rows.map(r => r.lease.id), propertyIds: rows.map(r => r.lease.property_id), unitIds: rows.map(r => r.lease.unit_id) };
}

export function tenantSafeMaintenance(r) {
  return sanitizeTenantPayload(r, "MaintenanceRequest");
}

export function tenantSafeInspection(r) {
  return sanitizeTenantPayload(r, "InspectionReport");
}

export function canTenantAccessMaintenance(r, access, ctx) {
  return !!r && activeOnly(r) && r.is_active !== false && r.organization_id === access.organization_id && r.tenant_id === access.tenant?.id && ctx.leaseIds.includes(r.lease_id);
}

export function canTenantAccessInspection(r, access, ctx) {
  return !!r && activeOnly(r) && r.is_active !== false && r.organization_id === access.organization_id && r.shared_with_tenant === true && ctx.leaseIds.includes(r.lease_id) && ctx.unitIds.includes(r.unit_id);
}

export async function listTenantMaintenance(access) {
  if (!access.tenant) return [];
  const data = await invokeTenantNovaSecurityBoundary("getMyTenantMaintenance");
  return data.maintenance_requests || [];
}

export async function getTenantMaintenanceById(access, id) {
  const data = await invokeTenantNovaSecurityBoundary("getMaintenanceRequestById", { maintenance_request_id: id }).catch(() => ({ maintenance_request: null }));
  return data.maintenance_request || null;
}

export async function createTenantMaintenance(access, form) {
  const ctx = await tenantContext(access);
  const lease = ctx.leases.find(l => l.id === form.lease_id);
  if (!lease) { await logUnauthorized(access, "MaintenanceRequest", form.lease_id || "unknown", "Tenant attempted maintenance submission outside authorized lease context"); return null; }
  const now = new Date().toISOString();
  const saved = await base44.entities.MaintenanceRequest.create({ organization_id: access.organization_id, property_id: lease.property_id, unit_id: lease.unit_id, lease_id: lease.id, tenant_id: access.tenant.id, submitted_by_user_id: access.user.id, category: form.category || "Other", priority: form.priority || "Routine", status: "Submitted", description: form.description, photos_videos_array: splitRefs(form.photos_videos_text), access_instructions: form.access_instructions || "", preferred_access_times: form.preferred_access_times || "", tenant_visible_notes: "", completion_photos_array: [], submitted_at: now, is_active: true });
  await audit(access, "MaintenanceRequest created", "MaintenanceRequest", saved.id, {}, saved, "Tenant submitted maintenance request");
  return saved;
}

export async function tenantUpdateMaintenance(access, row, updates, action) {
  const safeUpdates = { ...updates };
  const saved = await base44.entities.MaintenanceRequest.update(row.id, safeUpdates);
  await audit(access, action, "MaintenanceRequest", row.id, row, saved, action);
  return tenantSafeMaintenance(saved);
}

export async function listTenantInspections(access) {
  if (!access.tenant) return [];
  const data = await invokeTenantNovaSecurityBoundary("getMyTenantInspections");
  return data.inspection_reports || [];
}

export async function getTenantInspectionById(access, id) {
  const data = await invokeTenantNovaSecurityBoundary("getInspectionById", { inspection_report_id: id }).catch(() => ({ inspection_report: null }));
  return data.inspection_report || null;
}

export async function adminUpdateMaintenance(access, row, updates) {
  const saved = await base44.entities.MaintenanceRequest.update(row.id, updates);
  let action = "MaintenanceRequest status changed";
  if (updates.assigned_to_user_id_nullable || updates.vendor_id_nullable) action = "MaintenanceRequest assigned";
  if (updates.tenant_visible_notes !== undefined) action = "MaintenanceRequest tenant-visible note added";
  if (updates.internal_notes !== undefined) action = "MaintenanceRequest internal note added";
  if (updates.cost_estimate !== undefined || updates.actual_cost !== undefined || updates.chargeback_amount !== undefined) action = "MaintenanceRequest cost updated";
  if (updates.completion_photos_array !== undefined) action = "MaintenanceRequest completion photo added";
  if (updates.status === "Closed") action = "MaintenanceRequest closed";
  if (updates.status === "Reopened") action = "MaintenanceRequest reopened";
  await audit(access, action, "MaintenanceRequest", row.id, row, saved, action);
  return saved;
}

export async function archiveMaintenance(access, row) {
  const saved = await base44.entities.MaintenanceRequest.update(row.id, { deleted_at: new Date().toISOString(), is_active: false });
  await audit(access, "MaintenanceRequest archived", "MaintenanceRequest", row.id, row, saved, "MaintenanceRequest archived");
  return saved;
}

export async function createInspection(access, form, lease) {
  const saved = await base44.entities.InspectionReport.create({ organization_id: access.organization.id, property_id: lease.property_id, unit_id: lease.unit_id, lease_id: lease.id, inspection_type: form.inspection_type || "Periodic", inspection_date: form.inspection_date, inspector_user_id: access.user.id, tenant_present: !!form.tenant_present, room_by_room_condition_json: parseJson(form.room_text), photos_array: splitRefs(form.photos_text), damages_json: parseJson(form.damage_text), tenant_signature_placeholder: form.tenant_signature_placeholder || "", admin_signature_placeholder: form.admin_signature_placeholder || "", tenant_visible_notes: form.tenant_visible_notes || "", internal_admin_notes: form.internal_admin_notes || "", shared_with_tenant: !!form.shared_with_tenant, linked_document_id_nullable: form.linked_document_id_nullable || "", is_active: true });
  await audit(access, "InspectionReport created", "InspectionReport", saved.id, {}, saved, "InspectionReport created");
  return saved;
}

export async function updateInspection(access, row, updates) {
  const saved = await base44.entities.InspectionReport.update(row.id, updates);
  let action = "InspectionReport updated";
  if (updates.shared_with_tenant === true && !row.shared_with_tenant) action = "InspectionReport shared with tenant";
  if (updates.shared_with_tenant === false && row.shared_with_tenant) action = "InspectionReport unshared from tenant";
  await audit(access, action, "InspectionReport", row.id, row, saved, action);
  return saved;
}

export async function archiveInspection(access, row) {
  const saved = await base44.entities.InspectionReport.update(row.id, { deleted_at: new Date().toISOString(), is_active: false });
  await audit(access, "InspectionReport archived", "InspectionReport", row.id, row, saved, "InspectionReport archived");
  return saved;
}

export async function audit(access, action, entityType, entityId, beforeValues, afterValues, reason) {
  await createAuditLog({ organizationId: access.organization_id || access.organization?.id, user: access.user, role: access.membership?.role, action, entityType, entityId, beforeValues, afterValues, reason });
}

export async function logUnauthorized(access, entityType, entityId, reason) {
  await audit(access, entityType === "InspectionReport" ? "Unauthorized inspection access attempt" : "Unauthorized maintenance access attempt", entityType, entityId || "unknown", {}, {}, reason);
}