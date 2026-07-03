import { base44 } from "@/api/base44Client";
import { activeOnly, canTenantUseParticipant, createAuditLog } from "@/lib/tenantNova";
import { invokeTenantNovaSecurityBoundary, sanitizeTenantPayload } from "@/lib/security";

export const documentCategories = ["ID", "Income Proof", "Credit Background Check", "Insurance", "Lease", "Addendum", "Inspection", "Notice", "Form", "Receipt", "Maintenance", "Investor Report", "Internal", "Other"];
export const documentVisibilities = ["Tenant Only", "Shared With Tenant", "Admin Only", "Internal", "Investor Aggregate"];
export const signatureStatuses = ["Not Required", "Pending", "Signed", "Declined", "Expired"];
export const tenantVisibleDocumentVisibilities = ["Tenant Only", "Shared With Tenant"];

export const defaultVisibilityByCategory = {
  "ID": "Admin Only",
  "Income Proof": "Admin Only",
  "Credit Background Check": "Admin Only",
  "Insurance": "Shared With Tenant",
  "Lease": "Shared With Tenant",
  "Addendum": "Shared With Tenant",
  "Inspection": "Admin Only",
  "Notice": "Shared With Tenant",
  "Form": "Shared With Tenant",
  "Receipt": "Shared With Tenant",
  "Maintenance": "Admin Only",
  "Investor Report": "Investor Aggregate",
  "Internal": "Internal",
  "Other": "Admin Only"
};

export function expiryStatus(doc) {
  if (!doc.expiry_date_nullable) return "No expiry";
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (doc.expiry_date_nullable < today) return "Expired";
  if (doc.expiry_date_nullable <= soon) return "Expiring soon";
  return "Current";
}

export function tenantSafeDocument(doc) {
  return sanitizeTenantPayload(doc, "Document");
}

export async function getTenantDocumentContext(access) {
  if (!access.tenant) return { leaseIds: [], propertyIds: [], unitIds: [], ledgerEntryIds: [] };
  const participants = (await base44.entities.LeaseParticipant.filter({ organization_id: access.organization_id, tenant_id: access.tenant.id })).filter(canTenantUseParticipant);
  const leaseIds = participants.map(p => p.lease_id);
  const propertyIds = [];
  const unitIds = [];
  for (const leaseId of leaseIds) {
    const lease = await base44.entities.Lease.get(leaseId);
    if (lease && activeOnly(lease)) {
      propertyIds.push(lease.property_id);
      unitIds.push(lease.unit_id);
    }
  }
  const ledgerEntryIds = [];
  for (const leaseId of leaseIds) {
    const entries = await base44.entities.FinancialLedgerEntry.filter({ organization_id: access.organization_id, lease_id: leaseId });
    ledgerEntryIds.push(...entries.filter(activeOnly).map(e => e.id));
  }
  return { leaseIds, propertyIds, unitIds, ledgerEntryIds };
}

export function canTenantAccessDocument(doc, access, context) {
  if (!activeOnly(doc) || doc.is_active === false) return false;
  if (doc.organization_id !== access.organization_id) return false;
  if (!tenantVisibleDocumentVisibilities.includes(doc.visibility)) return false;
  if (doc.tenant_id_nullable && doc.tenant_id_nullable === access.tenant?.id) return true;
  if (doc.lease_id_nullable && context.leaseIds.includes(doc.lease_id_nullable)) return true;
  if (doc.unit_id_nullable && context.unitIds.includes(doc.unit_id_nullable)) return true;
  if (doc.property_id_nullable && context.propertyIds.includes(doc.property_id_nullable)) return true;
  if (doc.financial_ledger_entry_id_nullable && context.ledgerEntryIds.includes(doc.financial_ledger_entry_id_nullable)) return true;
  return false;
}

export async function getTenantDocuments(access) {
  if (!access.tenant) return [];
  const data = await invokeTenantNovaSecurityBoundary("getMyTenantDocuments");
  return data.documents || [];
}

export async function createDocument(access, payload, reason) {
  const doc = await base44.entities.Document.create({ ...payload, organization_id: access.organization.id, uploaded_by_user_id: access.user.id, version: Number(payload.version || 1), is_active: true });
  await createAuditLog({ organizationId: access.organization.id, user: access.user, role: access.membership.role, action: "Document uploaded", entityType: "Document", entityId: doc.id, afterValues: doc, reason: reason || "Admin uploaded document" });
  return doc;
}

export async function updateDocumentMetadata(access, doc, updates, reason) {
  const saved = await base44.entities.Document.update(doc.id, updates);
  const action = updates.visibility && updates.visibility !== doc.visibility ? "Document visibility changed" : updates.expiry_date_nullable !== doc.expiry_date_nullable ? "Document expiry date changed" : "Document metadata edited";
  await createAuditLog({ organizationId: doc.organization_id, user: access.user, role: access.membership.role, action, entityType: "Document", entityId: doc.id, beforeValues: doc, afterValues: saved, reason: reason || action });
  return saved;
}

export async function replaceDocument(access, doc, fileReference, title) {
  const { id, created_date, updated_date, ...copy } = doc;
  const next = await base44.entities.Document.create({ ...copy, title: title || doc.title, file_url_or_storage_reference: fileReference, uploaded_by_user_id: access.user.id, version: Number(doc.version || 1) + 1, replaced_by_document_id_nullable: "", is_active: true, deleted_at: "" });
  const old = await base44.entities.Document.update(doc.id, { replaced_by_document_id_nullable: next.id, is_active: false });
  await createAuditLog({ organizationId: doc.organization_id, user: access.user, role: access.membership.role, action: "Document replaced/versioned", entityType: "Document", entityId: doc.id, beforeValues: doc, afterValues: { old, replacement: next }, reason: "Document replaced with new version" });
  return next;
}

export async function archiveDocument(access, doc) {
  const saved = await base44.entities.Document.update(doc.id, { deleted_at: new Date().toISOString(), is_active: false });
  await createAuditLog({ organizationId: doc.organization_id, user: access.user, role: access.membership.role, action: "Document archived/soft-deleted", entityType: "Document", entityId: doc.id, beforeValues: doc, afterValues: saved, reason: "Admin archived document" });
  return saved;
}

export async function logUnauthorizedDocumentAttempt(access, documentId, reason) {
  await createAuditLog({ organizationId: access.organization_id || access.organization?.id, user: access.user, role: access.membership?.role, action: "Attempted unauthorized document access", entityType: "Document", entityId: documentId || "unknown", beforeValues: {}, afterValues: {}, reason: reason || "Unauthorized document access attempt detected by app access path" });
}