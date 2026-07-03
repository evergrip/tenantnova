import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog } from "@/lib/tenantNova";

export const INVESTOR_REPORT_WARNING = "Prototype investor report placeholder only. Aggregate property-level summary for internal admin review. Do not use as an external financial statement, investor communication, tax report, legal notice, or production distribution document.";
export const reportTypes = ["Monthly", "Quarterly", "Annual", "Custom"];
export const reportStatuses = ["Draft", "Reviewed", "Exported", "Archived"];
export const narrativeFields = ["investor_summary_text", "risk_notes", "next_steps", "capex_notes", "internal_admin_note"];
export const expenseFields = ["other_income", "operating_expenses", "repairs_maintenance", "utilities", "insurance", "property_taxes", "mortgage_debt_service_optional"];

function between(date, start, end) {
  const value = (date || "").slice(0, 10);
  return value && value >= start && value <= end;
}

function total(rows, predicate) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || "Unspecified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

export async function auditInvestor(access, action, entityId, beforeValues, afterValues, reason) {
  await createAuditLog({ organizationId: access.organization_id, user: access.user, role: access.membership?.role, action, entityType: "InvestorReport", entityId, beforeValues, afterValues, reason });
}

export async function listInvestorReports(access) {
  if (!access?.isAdmin) return [];
  const rows = await base44.entities.InvestorReport.filter({ organization_id: access.organization_id }, "-created_date", 200);
  return rows.filter(r => activeOnly(r) && r.is_active !== false && r.report_status !== "Archived");
}

export async function generateInvestorReportDraft(access, params) {
  if (!access?.isAdmin) return null;
  const property = await base44.entities.Property.get(params.property_id);
  if (!property || property.organization_id !== access.organization_id) return null;

  const [units, leases, ledger, maintenance, inspections, applications, forms, rules, workflows, docs] = await Promise.all([
    base44.entities.Unit.filter({ organization_id: access.organization_id, property_id: property.id }, undefined, 300),
    base44.entities.Lease.filter({ organization_id: access.organization_id, property_id: property.id }, undefined, 300),
    base44.entities.FinancialLedgerEntry.filter({ organization_id: access.organization_id, property_id: property.id }, undefined, 500),
    base44.entities.MaintenanceRequest.filter({ organization_id: access.organization_id, property_id: property.id }, undefined, 300),
    base44.entities.InspectionReport.filter({ organization_id: access.organization_id, property_id: property.id }, undefined, 300),
    base44.entities.RentalApplication.filter({ organization_id: access.organization_id, property_id_nullable: property.id }, undefined, 300),
    base44.entities.FormsLibrary.filter({ organization_id: access.organization_id }, undefined, 300),
    base44.entities.ComplianceRule.filter({ organization_id: access.organization_id }, undefined, 300),
    base44.entities.FormWorkflowRule.filter({ organization_id: access.organization_id }, undefined, 300),
    base44.entities.Document.filter({ organization_id: access.organization_id, property_id_nullable: property.id }, undefined, 300)
  ]);

  const activeUnits = units.filter(activeOnly);
  const activeLeases = leases.filter(l => activeOnly(l) && ["Active", "Ending"].includes(l.lease_status));
  const occupiedUnitIds = new Set(activeLeases.map(l => l.unit_id));
  const periodLedger = ledger.filter(e => between(e.effective_date, params.report_period_start, params.report_period_end));
  const grossRentCharged = total(periodLedger, e => e.entry_type === "Rent Charge" && e.debit_credit_type === "Debit");
  const rentCollected = total(periodLedger, e => e.entry_type === "Payment" && e.debit_credit_type === "Credit");
  const rentOutstanding = grossRentCharged - rentCollected;
  const otherIncome = Number(params.other_income || 0);
  const operatingExpenses = Number(params.operating_expenses || 0);
  const repairsMaintenance = Number(params.repairs_maintenance || 0);
  const utilities = Number(params.utilities || 0);
  const insurance = Number(params.insurance || 0);
  const propertyTaxes = Number(params.property_taxes || 0);
  const mortgageDebt = Number(params.mortgage_debt_service_optional || 0);
  const expenseTotal = operatingExpenses + repairsMaintenance + utilities + insurance + propertyTaxes;
  const noi = grossRentCharged + otherIncome - expenseTotal;

  const maintRows = maintenance.filter(activeOnly);
  const inspectionRows = inspections.filter(i => activeOnly(i) && between(i.inspection_date, params.report_period_start, params.report_period_end));
  const appRows = applications.filter(a => activeOnly(a) && (!a.submitted_at || between(a.submitted_at, params.report_period_start, params.report_period_end)));
  const reportDocs = docs.filter(d => activeOnly(d) && ["Form", "Notice"].includes(d.category) && (!d.generated_at || between(d.generated_at, params.report_period_start, params.report_period_end)));

  return {
    organization_id: access.organization_id,
    property_id: property.id,
    report_period_start: params.report_period_start,
    report_period_end: params.report_period_end,
    report_type: params.report_type,
    report_status: "Draft",
    generated_by_user_id: access.user.id,
    investor_summary_text: params.investor_summary_text || "Draft aggregate property-level investor summary for admin review only.",
    property_snapshot_json: { property_name: property.property_name, city: property.city || "", province: property.province || "NS", property_type: property.property_type || "", report_warning: INVESTOR_REPORT_WARNING },
    total_units: activeUnits.length,
    occupied_units: occupiedUnitIds.size,
    vacant_units: Math.max(0, activeUnits.length - occupiedUnitIds.size),
    occupancy_rate: activeUnits.length ? Number((occupiedUnitIds.size / activeUnits.length).toFixed(4)) : 0,
    gross_rent_charged: money(grossRentCharged),
    rent_collected: money(rentCollected),
    rent_outstanding: money(rentOutstanding),
    arrears_amount: money(Math.max(0, rentOutstanding)),
    security_deposits_held: money(total(periodLedger, e => e.entry_type === "Security Deposit")),
    other_income: money(otherIncome),
    operating_expenses: money(operatingExpenses),
    repairs_maintenance: money(repairsMaintenance),
    utilities: money(utilities),
    insurance: money(insurance),
    property_taxes: money(propertyTaxes),
    mortgage_debt_service_optional: money(mortgageDebt),
    NOI: money(noi),
    cash_flow_after_debt_optional: money(noi - mortgageDebt),
    maintenance_summary_json: { open_requests: maintRows.filter(m => !["Completed", "Closed"].includes(m.status)).length, closed_requests: maintRows.filter(m => ["Completed", "Closed"].includes(m.status)).length, emergency_requests: maintRows.filter(m => m.priority === "Emergency").length, top_categories: countBy(maintRows, "category") },
    leasing_summary_json: { active_lease_count: activeLeases.length, lease_type_counts: countBy(activeLeases, "lease_type") },
    inspection_summary_json: { inspections_completed: inspectionRows.length, move_in_count: inspectionRows.filter(i => i.inspection_type === "Move-In").length, move_out_count: inspectionRows.filter(i => i.inspection_type === "Move-Out").length, periodic_count: inspectionRows.filter(i => i.inspection_type === "Periodic").length },
    application_summary_json: { applications_submitted: appRows.filter(a => a.application_status === "Submitted").length, applications_approved: appRows.filter(a => a.application_status === "Approved").length, applications_declined: appRows.filter(a => a.application_status === "Declined").length, applications_under_review: appRows.filter(a => a.application_status === "Under Review").length },
    forms_compliance_summary_json: { forms_generated_drafted_count: reportDocs.length, unverified_compliance_rules_count: rules.filter(r => activeOnly(r) && r.verification_status !== "Verified").length, active_workflow_rule_count: workflows.filter(activeOnly).length, warning: "Aggregate counts only. No legal advice or private notice details." },
    risk_notes: params.risk_notes || "",
    next_steps: params.next_steps || "",
    capex_notes: params.capex_notes || "",
    internal_admin_note: params.internal_admin_note || "",
    is_active: true
  };
}

export async function createInvestorReport(access, draft) {
  const saved = await base44.entities.InvestorReport.create(draft);
  await auditInvestor(access, "InvestorReport generated", saved.id, {}, saved, "Aggregate investor report draft generated from dummy/test data");
  await auditInvestor(access, "InvestorReport created", saved.id, {}, saved, "Investor report draft saved");
  return saved;
}

export async function updateInvestorReport(access, report, updates) {
  const cleaned = { ...updates };
  expenseFields.forEach(field => { if (cleaned[field] !== undefined) cleaned[field] = Number(cleaned[field] || 0); });
  const saved = await base44.entities.InvestorReport.update(report.id, cleaned);
  await auditInvestor(access, "InvestorReport updated", report.id, report, saved, "Investor report narrative fields updated");
  return saved;
}

export async function markInvestorReportReviewed(access, report) {
  const saved = await base44.entities.InvestorReport.update(report.id, { report_status: "Reviewed", reviewed_by_user_id_nullable: access.user.id });
  await auditInvestor(access, "InvestorReport reviewed", report.id, report, saved, "Investor report marked reviewed");
  return saved;
}

export async function createInvestorExportPlaceholder(access, report, property) {
  const period = `${report.report_period_start} to ${report.report_period_end}`;
  const title = `Draft Investor Report — ${property?.property_name || "Property"} — ${period}`;
  const body = [
    INVESTOR_REPORT_WARNING,
    "Aggregate-only warning: this placeholder intentionally excludes tenant names, tenant contact information, applicant details, raw ledger entries, internal notes, private file references, and legal notice details.",
    `Report status: ${report.report_status}`,
    `Generated date: ${new Date().toISOString()}`,
    `Period: ${period}`,
    `NOI placeholder: ${report.NOI || 0}`,
    `Occupancy rate placeholder: ${report.occupancy_rate || 0}`
  ].join("\n");
  const doc = await base44.entities.Document.create({ organization_id: access.organization_id, property_id_nullable: report.property_id, category: "Investor Report", title, file_url_or_storage_reference: body, uploaded_by_user_id: access.user.id, visibility: "Admin Only", version: 1, signature_status: "Not Required", requires_signature: false, tenant_visible_note: "Not shared with tenants or investors.", internal_admin_note: INVESTOR_REPORT_WARNING, generated_by_user_id: access.user.id, generated_at: new Date().toISOString(), draft_metadata_json: { investor_report_id: report.id, aggregate_only: true, prototype_only: true, excludes_private_data: true, warning: INVESTOR_REPORT_WARNING }, is_active: true });
  await createAuditLog({ organizationId: access.organization_id, user: access.user, role: access.membership?.role, action: "InvestorReport document created", entityType: "Document", entityId: doc.id, beforeValues: {}, afterValues: doc, reason: "Investor report export placeholder document created" });
  const saved = await base44.entities.InvestorReport.update(report.id, { report_status: "Exported", exported_at_nullable: new Date().toISOString(), attached_document_id_nullable: doc.id });
  await auditInvestor(access, "InvestorReport exported placeholder generated", report.id, report, saved, "Investor report export placeholder generated; no external delivery occurred");
  return { report: saved, document: doc };
}

export async function archiveInvestorReport(access, report) {
  const saved = await base44.entities.InvestorReport.update(report.id, { report_status: "Archived", is_active: false, deleted_at: new Date().toISOString() });
  await auditInvestor(access, "InvestorReport archived", report.id, report, saved, "Investor report archived");
  return saved;
}