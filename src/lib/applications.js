import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog } from "@/lib/tenantNova";

export const applicationStatuses = ["Draft", "Submitted", "Under Review", "More Info Requested", "Approved", "Declined", "Withdrawn", "Lease Offered", "Lease Signed"];
export const editableApplicantStatuses = ["Draft", "More Info Requested"];
export const withdrawableApplicantStatuses = ["Submitted", "Under Review", "More Info Requested"];
export const allowedTransitions = {
  Draft: ["Submitted"],
  Submitted: ["Under Review", "Withdrawn"],
  "Under Review": ["More Info Requested", "Approved", "Declined"],
  "More Info Requested": ["Submitted", "Withdrawn"],
  Approved: ["Lease Offered"],
  "Lease Offered": ["Lease Signed"]
};
export const jsonFields = ["previous_addresses_2_years_json", "household_members_json", "co_applicants_json", "employment_info_json", "income_info_json", "references_json", "pets_json", "vehicles_json"];
export const blankJsonText = "{}";
export const parseJson = (value) => { try { return value ? JSON.parse(value) : {}; } catch { return {}; } };
export const jsonText = (value) => JSON.stringify(value || {}, null, 2);
export const splitIds = (value) => (value || "").split(",").map(v => v.trim()).filter(Boolean);

export function applicantSafeApplication(app) {
  if (!app) return null;
  const { internal_score, internal_notes, admin_review_notes, decision_reason_internal, ...safe } = app;
  return safe;
}

export function applicantCanAccess(app, access) {
  return !!app && activeOnly(app) && app.is_active !== false && access?.isApplicant && app.organization_id === access.organization_id && app.applicant_user_id === access.user.id;
}

export async function listApplicantApplications(access) {
  if (!access?.isApplicant) return [];
  const rows = await base44.entities.RentalApplication.filter({ organization_id: access.organization_id, applicant_user_id: access.user.id }, "-created_date", 20);
  return rows.filter(r => applicantCanAccess(r, access)).map(applicantSafeApplication);
}

export async function getApplicantApplication(access, id) {
  const row = await base44.entities.RentalApplication.get(id).catch(() => null);
  if (!applicantCanAccess(row, access)) { await logUnauthorized(access, id, "Applicant unauthorized access attempt"); return null; }
  return applicantSafeApplication(row);
}

export async function saveApplicantApplication(access, form, existing) {
  const now = new Date().toISOString();
  const payload = normalizeApplicationForm(access, form);
  if (existing?.id) {
    if (!editableApplicantStatuses.includes(existing.application_status)) return null;
    const saved = await base44.entities.RentalApplication.update(existing.id, payload);
    await audit(access, existing.application_status === "Draft" ? "RentalApplication draft saved" : "RentalApplication updated by applicant", existing.id, existing, saved, "Applicant saved application");
    return applicantSafeApplication(saved);
  }
  const saved = await base44.entities.RentalApplication.create({ ...payload, organization_id: access.organization_id, applicant_user_id: access.user.id, applicant_email: payload.applicant_email || access.user.email || "applicant@example.test", application_status: "Draft", uploaded_document_ids_array: [], is_active: true });
  await audit(access, "RentalApplication created", saved.id, {}, saved, "Applicant created draft application");
  await audit(access, "RentalApplication draft saved", saved.id, {}, saved, "Applicant saved draft application");
  return applicantSafeApplication(saved);
}

export async function submitApplicantApplication(access, app) {
  if (!editableApplicantStatuses.includes(app.application_status)) return null;
  const saved = await base44.entities.RentalApplication.update(app.id, { application_status: "Submitted", submitted_at: new Date().toISOString() });
  await audit(access, "RentalApplication submitted", app.id, app, saved, "Applicant submitted application");
  return applicantSafeApplication(saved);
}

export async function withdrawApplicantApplication(access, app) {
  if (!withdrawableApplicantStatuses.includes(app.application_status)) return null;
  const saved = await base44.entities.RentalApplication.update(app.id, { application_status: "Withdrawn", withdrawn_at_nullable: new Date().toISOString() });
  await audit(access, "RentalApplication withdrawn", app.id, app, saved, "Applicant withdrew application");
  return applicantSafeApplication(saved);
}

export function normalizeApplicationForm(access, form) {
  const data = { ...form };
  jsonFields.forEach(field => { data[field] = typeof data[field] === "string" ? parseJson(data[field]) : data[field] || {}; });
  data.uploaded_document_ids_array = Array.isArray(data.uploaded_document_ids_array) ? data.uploaded_document_ids_array : splitIds(data.uploaded_document_ids_text);
  delete data.uploaded_document_ids_text;
  return data;
}

export async function listApplicantDocuments(access, applicationId) {
  if (!access?.isApplicant) return [];
  const app = await base44.entities.RentalApplication.get(applicationId).catch(() => null);
  if (!applicantCanAccess(app, access)) return [];
  const docs = await base44.entities.Document.filter({ organization_id: access.organization_id, application_id_nullable: applicationId }, "-created_date", 50);
  return docs.filter(d => activeOnly(d) && d.is_active !== false && !["Admin Only", "Internal"].includes(d.visibility));
}

export async function adminUpdateApplication(access, app, updates, reason) {
  const saved = await base44.entities.RentalApplication.update(app.id, updates);
  let action = "RentalApplication reviewed by admin";
  if (updates.application_status && updates.application_status !== app.application_status) action = "RentalApplication status changed";
  if (updates.application_status === "More Info Requested") action = "More info requested";
  if (updates.applicant_visible_message !== undefined) action = "Applicant-visible message added";
  if (updates.internal_notes !== undefined) action = "Internal note added";
  if (updates.internal_score !== undefined) action = "Internal score changed";
  if (updates.application_status === "Approved") action = "RentalApplication approved";
  if (updates.application_status === "Declined") action = "RentalApplication declined";
  await audit(access, action, app.id, app, saved, reason || action);
  return saved;
}

export function canAdminTransition(from, to, updates = {}) {
  if (!allowedTransitions[from]?.includes(to)) return false;
  if (to === "Declined" && !updates.decision_reason_internal) return false;
  if (to === "Approved" && !updates.admin_review_notes) return false;
  return true;
}

export async function archiveApplication(access, app) {
  const saved = await base44.entities.RentalApplication.update(app.id, { is_active: false, deleted_at: new Date().toISOString() });
  await audit(access, "Admin archive/soft-delete application", app.id, app, saved, "Admin archived application");
  return saved;
}

export async function createApplicationDocument(access, app, title, ref, visibility = "Shared With Tenant", category = "Other") {
  const finalCategory = title.toLowerCase().includes("credit") || title.toLowerCase().includes("background") ? "Credit Background Check" : category;
  const finalVisibility = finalCategory === "Credit Background Check" ? "Admin Only" : visibility;
  const doc = await base44.entities.Document.create({ organization_id: app.organization_id, application_id_nullable: app.id, category: finalCategory, title, file_url_or_storage_reference: ref, uploaded_by_user_id: access.user.id, visibility: finalVisibility, version: 1, signature_status: "Not Required", requires_signature: false, is_active: true });
  const ids = Array.from(new Set([...(app.uploaded_document_ids_array || []), doc.id]));
  await base44.entities.RentalApplication.update(app.id, { uploaded_document_ids_array: ids });
  return doc;
}

export async function convertApplication(access, app) {
  if (app.application_status !== "Approved") return null;
  let tenants = await base44.entities.Tenant.filter({ organization_id: app.organization_id, auth_user_id: app.applicant_user_id });
  tenants = tenants.filter(activeOnly);
  let tenant = tenants[0];
  if (!tenant) {
    tenant = await base44.entities.Tenant.create({ organization_id: app.organization_id, auth_user_id: app.applicant_user_id, first_name: app.applicant_first_name, last_name: app.applicant_last_name, email: app.applicant_email, phone: app.applicant_phone, active_status: "Active", onboarding_status: "Not Started" });
    await createAuditLog({ organizationId: app.organization_id, user: access.user, role: access.membership?.role, action: "RentalApplication converted to Tenant", entityType: "Tenant", entityId: tenant.id, afterValues: tenant, reason: "Approved application converted to Tenant" });
  }
  const existingTenantMembership = (await base44.entities.OrganizationMembership.filter({ organization_id: app.organization_id, user_id: app.applicant_user_id, role: "Tenant" })).filter(activeOnly)[0];
  if (!existingTenantMembership) await base44.entities.OrganizationMembership.create({ organization_id: app.organization_id, user_id: app.applicant_user_id, role: "Tenant", is_active: true });
  let lease = null;
  if (app.linked_lease_id_nullable) lease = await base44.entities.Lease.get(app.linked_lease_id_nullable).catch(() => null);
  if (!lease) {
    lease = await base44.entities.Lease.create({ organization_id: app.organization_id, property_id: app.property_id_nullable || "pending-property", unit_id: app.unit_id_nullable || "pending-unit", primary_tenant_id: tenant.id, lease_type: "Fixed Term", province: access.organization?.default_province || "NS", start_date: app.desired_move_in_date || new Date().toISOString().slice(0,10), rent_amount: 0, rent_due_day: 1, payment_frequency: "Monthly", lease_status: "Draft" });
    await createAuditLog({ organizationId: app.organization_id, user: access.user, role: access.membership?.role, action: "Draft Lease created from application", entityType: "Lease", entityId: lease.id, afterValues: lease, reason: "Draft Lease created from approved application" });
  }
  const participant = await base44.entities.LeaseParticipant.create({ organization_id: app.organization_id, lease_id: lease.id, tenant_id: tenant.id, participant_role: "Primary Tenant", access_level: "Full Lease Access", is_financially_responsible: true, start_date: lease.start_date, is_active: true });
  await createAuditLog({ organizationId: app.organization_id, user: access.user, role: access.membership?.role, action: "LeaseParticipant created from application", entityType: "LeaseParticipant", entityId: participant.id, afterValues: participant, reason: "LeaseParticipant created from approved application" });
  const saved = await base44.entities.RentalApplication.update(app.id, { linked_tenant_id_nullable: tenant.id, linked_lease_id_nullable: lease.id });
  await audit(access, "RentalApplication converted to Tenant", app.id, app, saved, "Application conversion completed");
  return { tenant, lease, participant, application: saved };
}

export async function audit(access, action, entityId, beforeValues, afterValues, reason) {
  await createAuditLog({ organizationId: access.organization_id || access.organization?.id, user: access.user, role: access.membership?.role, action, entityType: "RentalApplication", entityId, beforeValues, afterValues, reason });
}

export async function logUnauthorized(access, entityId, reason) {
  await createAuditLog({ organizationId: access.organization_id || access.organization?.id || "unknown", user: access.user, role: access.membership?.role, action: "Applicant unauthorized access attempt", entityType: "RentalApplication", entityId: entityId || "unknown", beforeValues: {}, afterValues: {}, reason });
}