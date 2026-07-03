import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog, getTenantLeases } from "@/lib/tenantNova";

export const LEGAL_WARNING = "This system organizes forms, rules, reminders, and workflow drafts for convenience only. It does not provide legal advice. Before relying on any form, fee, deadline, notice period, rent increase rule, deposit rule, or legal workflow, verify the current requirement with the official provincial residential tenancies authority or qualified legal advice.";
export const DRAFT_NOTICE = "Draft only — requires admin verification before use.";
export const verificationStatuses = ["Unverified", "Needs Review", "Verified", "Archived"];
export const formCategories = ["Lease", "Notice", "Rent Increase", "Deposit", "Dispute", "Service", "Inspection", "Application", "Termination", "Other"];
export const whoCanUseOptions = ["Tenant", "Admin", "Both"];
export const ruleCategories = ["Security Deposit", "Rent Increase", "Late Fee", "Notice Period", "Lease Conversion", "Notice to Quit", "Service", "Deposit Return", "Application", "Other"];
export const leaseTypes = ["Fixed Term", "Year-to-Year", "Month-to-Month", "Week-to-Week", "All"];
export const maxAmountTypes = ["Flat", "Percentage", "Half Month Rent", "Other", "None"];
export const workflowRoles = ["Tenant", "Admin", "Both"];
export const moveOutReasons = [
  "End of lease term / normal move-out",
  "Rent increase received and tenant wants to leave",
  "Health decline",
  "Accepted into nursing home",
  "Property sold and purchaser will occupy",
  "Other / unsure"
];
export const moveOutFormMap = {
  "End of lease term / normal move-out": "Form C",
  "Rent increase received and tenant wants to leave": "Form C1",
  "Health decline": "Form G",
  "Accepted into nursing home": "Form H",
  "Property sold and purchaser will occupy": "Form DR2",
  "Other / unsure": "Admin Review"
};

export function safeTenantForm(form) {
  return {
    id: form.id,
    form_code: form.form_code,
    form_name: form.form_name,
    category: form.category,
    description: form.description,
    usage_notes: form.usage_notes,
    province: form.province,
    legal_warning: form.legal_warning,
    verification_status: form.verification_status
  };
}

export function safeComplianceSummary(rule) {
  if (!rule) return null;
  return {
    rule_category: rule.rule_category,
    rule_name: rule.rule_name,
    rule_description: rule.rule_description,
    related_form_code_nullable: rule.related_form_code_nullable,
    verification_status: rule.verification_status,
    admin_warning: rule.admin_warning
  };
}

export async function auditForms(access, action, entityType, entityId, beforeValues, afterValues, reason) {
  await createAuditLog({ organizationId: access.organization_id || access.organization?.id, user: access.user, role: access.membership?.role, action, entityType, entityId, beforeValues, afterValues, reason });
}

export async function listTenantForms(access) {
  if (!access?.isTenant) return [];
  const rows = await base44.entities.FormsLibrary.filter({ organization_id: access.organization_id }, "form_code", 200);
  return rows.filter(r => activeOnly(r) && r.is_active !== false && ["Tenant", "Both"].includes(r.who_can_use)).map(safeTenantForm);
}

export async function listTenantWorkflows(access) {
  if (!access?.isTenant) return [];
  const rows = await base44.entities.FormWorkflowRule.filter({ organization_id: access.organization_id }, "workflow_name", 100);
  return rows.filter(r => activeOnly(r) && r.is_active !== false && ["Tenant", "Both"].includes(r.user_role));
}

export async function listTenantSharedDrafts(access) {
  if (!access?.isTenant || !access.tenant) return [];
  const leasePairs = await getTenantLeases(access.organization_id, access.tenant.id);
  const leaseIds = leasePairs.map(p => p.lease.id);
  const docs = await base44.entities.Document.filter({ organization_id: access.organization_id, visibility: "Shared With Tenant" }, "-created_date", 100);
  return docs.filter(d => activeOnly(d) && d.is_active !== false && (d.tenant_id_nullable === access.tenant.id || leaseIds.includes(d.lease_id_nullable)) && ["Form", "Notice"].includes(d.category));
}

export async function saveFormsLibrary(access, form, existing) {
  const payload = { ...form, legal_warning: form.legal_warning || LEGAL_WARNING, is_active: true };
  if (existing?.id) {
    const saved = await base44.entities.FormsLibrary.update(existing.id, payload);
    const action = existing.verification_status !== saved.verification_status ? "FormsLibrary verification status changed" : "FormsLibrary record updated";
    await auditForms(access, action, "FormsLibrary", existing.id, existing, saved, action);
    return saved;
  }
  const saved = await base44.entities.FormsLibrary.create({ ...payload, organization_id: access.organization_id, verification_status: payload.verification_status || "Unverified" });
  await auditForms(access, "FormsLibrary record created", "FormsLibrary", saved.id, {}, saved, "FormsLibrary record created");
  return saved;
}

export async function saveComplianceRule(access, rule, existing) {
  const payload = { ...rule, admin_warning: rule.admin_warning || LEGAL_WARNING, is_active: true };
  ["required_notice_days_nullable", "required_notice_months_nullable", "maximum_amount_value_nullable"].forEach(field => { if (payload[field] === "") delete payload[field]; else if (payload[field] !== undefined) payload[field] = Number(payload[field]); });
  if (existing?.id) {
    const saved = await base44.entities.ComplianceRule.update(existing.id, payload);
    const action = existing.verification_status !== saved.verification_status ? "ComplianceRule verification status changed" : "ComplianceRule updated";
    await auditForms(access, action, "ComplianceRule", existing.id, existing, saved, action);
    return saved;
  }
  const saved = await base44.entities.ComplianceRule.create({ ...payload, organization_id: access.organization_id, verification_status: payload.verification_status || "Unverified" });
  await auditForms(access, "ComplianceRule created", "ComplianceRule", saved.id, {}, saved, "ComplianceRule created");
  return saved;
}

export async function saveWorkflowRule(access, workflow, existing) {
  const payload = { ...workflow, legal_warning: workflow.legal_warning || LEGAL_WARNING, required_admin_review_boolean: true, is_active: true };
  if (existing?.id) {
    const saved = await base44.entities.FormWorkflowRule.update(existing.id, payload);
    const action = existing.verification_status !== saved.verification_status ? "FormWorkflowRule verification status changed" : "FormWorkflowRule updated";
    await auditForms(access, action, "FormWorkflowRule", existing.id, existing, saved, action);
    return saved;
  }
  const saved = await base44.entities.FormWorkflowRule.create({ ...payload, organization_id: access.organization_id, verification_status: payload.verification_status || "Unverified" });
  await auditForms(access, "FormWorkflowRule created", "FormWorkflowRule", saved.id, {}, saved, "FormWorkflowRule created");
  return saved;
}

export async function archiveFormsEntity(access, entityName, record) {
  const saved = await base44.entities[entityName].update(record.id, { is_active: false, deleted_at: new Date().toISOString(), verification_status: "Archived" });
  const action = entityName === "FormsLibrary" ? "FormsLibrary archived" : entityName === "ComplianceRule" ? "ComplianceRule archived" : "FormWorkflowRule archived";
  await auditForms(access, action, entityName, record.id, record, saved, action);
  return saved;
}

export async function tenantMoveOutWorkflow(access, answers) {
  if (!access?.isTenant || !access.tenant) return null;
  const leasePairs = await getTenantLeases(access.organization_id, access.tenant.id);
  const lease = leasePairs.map(p => p.lease).find(l => l.id === answers.lease_id);
  if (!lease) { await auditForms(access, "Unauthorized form/compliance/workflow access attempt", "FormWorkflowRule", answers.workflow_id || "tenant-move-out", {}, answers, "Tenant attempted workflow for unrelated lease"); return null; }
  const formCode = moveOutFormMap[answers.reason] || "Admin Review";
  const form = formCode === "Admin Review" ? null : await findFormByCode(access.organization_id, formCode);
  await auditForms(access, "Tenant workflow started", "FormWorkflowRule", answers.workflow_id || "tenant-move-out", {}, answers, "Tenant started move-out workflow");
  const doc = await createDraftDocument(access, { lease, tenantId: access.tenant.id, form, formCode, title: `Draft only — tenant move-out request (${formCode})`, workflowType: "Tenant Move-Out", request: answers, category: "Notice", actorRole: "Tenant" });
  await auditForms(access, "Tenant workflow request submitted for admin review", "Document", doc.id, {}, doc, "Tenant move-out workflow request submitted for admin review");
  return { form_code: formCode, requires_admin_review: true, draft_document: doc, message: DRAFT_NOTICE };
}

export async function adminNonPaymentDraft(access, leaseId) {
  if (!access?.isAdmin) return null;
  const lease = await base44.entities.Lease.get(leaseId);
  if (!lease || lease.organization_id !== access.organization_id) return null;
  const rule = await findRuleByFormCode(access.organization_id, "Form D");
  const form = await findFormByCode(access.organization_id, "Form D");
  const ledger = await base44.entities.FinancialLedgerEntry.filter({ organization_id: access.organization_id, lease_id: lease.id }, "effective_date", 200);
  const balance = ledger.reduce((sum, e) => sum + (e.debit_credit_type === "Debit" ? Number(e.amount || 0) : -Number(e.amount || 0)), 0);
  const doc = await createDraftDocument(access, { lease, tenantId: lease.primary_tenant_id, form, formCode: "Form D", rule, title: "Draft only — non-payment notice placeholder", workflowType: "Admin Non-Payment Draft", request: { ledger_balance_placeholder: balance }, category: "Notice", actorRole: "Admin" });
  await auditForms(access, "Admin non-payment draft generated", "Document", doc.id, {}, doc, "Admin generated non-payment draft placeholder");
  return { draft_document: doc, form, compliance_rule: safeComplianceSummary(rule), ledger_balance_placeholder: balance, legal_warning: LEGAL_WARNING, message: DRAFT_NOTICE };
}

export async function adminSecurityDepositReview(access, leaseId) {
  if (!access?.isAdmin) return null;
  const lease = await base44.entities.Lease.get(leaseId);
  if (!lease || lease.organization_id !== access.organization_id) return null;
  const rule = await findRuleByFormCode(access.organization_id, "Form S");
  const form = await findFormByCode(access.organization_id, "Form S");
  const ledger = await base44.entities.FinancialLedgerEntry.filter({ organization_id: access.organization_id, lease_id: lease.id }, "effective_date", 200);
  const inspections = await base44.entities.InspectionReport.filter({ organization_id: access.organization_id, lease_id: lease.id }, "-inspection_date", 20);
  const depositEntries = ledger.filter(e => e.entry_type === "Security Deposit");
  const doc = await createDraftDocument(access, { lease, tenantId: lease.primary_tenant_id, form, formCode: "Form S", rule, title: "Draft only — security deposit review placeholder", workflowType: "Security Deposit Review", request: { deposit_entries_count: depositEntries.length, inspection_count: inspections.length }, category: "Form", actorRole: "Admin" });
  await auditForms(access, "Security deposit draft/review generated", "Document", doc.id, {}, doc, "Admin generated security deposit review placeholder");
  return { draft_document: doc, form, compliance_rule: safeComplianceSummary(rule), deposit_entries_count: depositEntries.length, inspection_count: inspections.length, legal_warning: LEGAL_WARNING, message: DRAFT_NOTICE };
}

export async function shareDraftWithTenant(access, doc) {
  if (!access?.isAdmin || !window.confirm("Share this draft with the tenant after admin verification?")) return null;
  const saved = await base44.entities.Document.update(doc.id, { visibility: "Shared With Tenant" });
  await auditForms(access, "Draft form/notice shared with tenant", "Document", doc.id, doc, saved, "Admin confirmed draft sharing with tenant");
  return saved;
}

export async function createDraftDocument(access, { lease, tenantId, form, formCode, rule, title, workflowType, request, category, actorRole }) {
  const now = new Date().toISOString();
  const metadata = { draft_notice: DRAFT_NOTICE, verification_status: form?.verification_status || rule?.verification_status || "Unverified", legal_warning: LEGAL_WARNING, source_url: form?.official_source_url || rule?.official_source_url || "", generated_by_user_id: access.user.id, generated_at: now, workflow_type: workflowType, request, requires_admin_review: true };
  const doc = await base44.entities.Document.create({
    organization_id: access.organization_id,
    property_id_nullable: lease?.property_id || "",
    unit_id_nullable: lease?.unit_id || "",
    lease_id_nullable: lease?.id || "",
    tenant_id_nullable: tenantId || "",
    category,
    title,
    file_url_or_storage_reference: `${DRAFT_NOTICE}\n${LEGAL_WARNING}\nForm: ${formCode}\nGenerated: ${now}`,
    uploaded_by_user_id: access.user.id,
    visibility: "Admin Only",
    version: 1,
    signature_status: "Not Required",
    requires_signature: false,
    tenant_visible_note: DRAFT_NOTICE,
    internal_admin_note: `${DRAFT_NOTICE}\n${LEGAL_WARNING}`,
    generated_by_user_id: access.user.id,
    generated_at: now,
    draft_metadata_json: metadata,
    is_active: true
  });
  await auditForms(access, "Draft form/notice generated", "Document", doc.id, {}, doc, `${actorRole} generated draft placeholder requiring admin review`);
  return doc;
}

export async function findFormByCode(organizationId, code) {
  const rows = await base44.entities.FormsLibrary.filter({ organization_id: organizationId, form_code: code }, "-created_date", 1);
  return rows.find(activeOnly) || null;
}

export async function findRuleByFormCode(organizationId, code) {
  const rows = await base44.entities.ComplianceRule.filter({ organization_id: organizationId, related_form_code_nullable: code }, "-created_date", 1);
  return rows.find(activeOnly) || null;
}