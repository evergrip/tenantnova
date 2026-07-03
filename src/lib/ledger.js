import { base44 } from "@/api/base44Client";
import { activeOnly, canTenantUseParticipant, createAuditLog } from "@/lib/tenantNova";
import { invokeTenantNovaSecurityBoundary, sanitizeTenantPayload } from "@/lib/security";

export const entryTypes = ["Rent Charge", "Payment", "Security Deposit", "Late Fee", "Adjustment", "Refund", "NSF Fee", "Damage Charge", "Other"];
export const methods = ["Manual", "E-transfer", "Cheque", "Cash", "Card Placeholder", "PAD Placeholder", "Other"];
export const methodLabel = (method) => method === "Card Placeholder" ? "Card Placeholder - Not Active" : method === "PAD Placeholder" ? "PAD Placeholder - Not Active" : method;
export const statuses = ["Pending", "Posted", "Failed", "Reversed", "Refunded"];

export function calculateLeaseBalance(entries) {
  return entries.filter(e => activeOnly(e) && ["Posted", "Reversed"].includes(e.status)).reduce((sum, e) => sum + (e.debit_credit_type === "Debit" ? Number(e.amount || 0) : -Number(e.amount || 0)), 0);
}

export function tenantSafeLedgerEntry(entry) {
  return sanitizeTenantPayload({
    id: entry.id,
    lease_id: entry.lease_id,
    entry_type: entry.entry_type,
    amount: entry.amount,
    debit_credit_type: entry.debit_credit_type,
    effective_date: entry.effective_date,
    due_date_optional: entry.due_date_optional,
    payment_method: entry.payment_method,
    receipt_reference_optional: entry.receipt_reference_optional,
    status: entry.status,
    tenant_visible_note: entry.tenant_visible_note,
    reversal_entry_id_nullable: entry.reversal_entry_id_nullable,
    internal_admin_note: entry.internal_admin_note,
    created_date: entry.created_date
  }, "FinancialLedgerEntry");
}

export async function getTenantLedgerEntries(access) {
  if (!access.tenant) return [];
  const data = await invokeTenantNovaSecurityBoundary("getMyTenantLedger");
  return data.entries || [];
}

export async function createLedgerEntry(access, payload, reason) {
  const saved = await base44.entities.FinancialLedgerEntry.create({ ...payload, organization_id: access.organization.id, created_by_user_id: access.user.id });
  const action = `${payload.entry_type} posted`;
  await createAuditLog({ organizationId: access.organization.id, user: access.user, role: access.membership.role, action, entityType: "FinancialLedgerEntry", entityId: saved.id, afterValues: saved, reason: reason || action });
  return saved;
}

export async function reverseLedgerEntry(access, entry, reason) {
  if (entry.status !== "Posted") throw new Error("Only posted entries can be reversed.");
  const reversal = await base44.entities.FinancialLedgerEntry.create({
    organization_id: entry.organization_id,
    property_id: entry.property_id,
    unit_id: entry.unit_id,
    lease_id: entry.lease_id,
    tenant_id: entry.tenant_id,
    entry_type: "Adjustment",
    amount: Number(entry.amount || 0),
    debit_credit_type: entry.debit_credit_type === "Debit" ? "Credit" : "Debit",
    effective_date: new Date().toISOString().slice(0, 10),
    payment_method: "Manual",
    status: "Posted",
    tenant_visible_note: `Reversal for ${entry.entry_type}`,
    internal_admin_note: reason || "Admin reversal",
    reversal_entry_id_nullable: entry.id,
    created_by_user_id: access.user.id
  });
  const updated = await base44.entities.FinancialLedgerEntry.update(entry.id, { status: "Reversed", reversal_entry_id_nullable: reversal.id });
  await createAuditLog({ organizationId: entry.organization_id, user: access.user, role: access.membership.role, action: "Entry reversed", entityType: "FinancialLedgerEntry", entityId: entry.id, beforeValues: entry, afterValues: { original: updated, reversal }, reason: reason || "Admin reversed posted entry" });
  return reversal;
}

export function agingBucket(balance, oldestDueDate) {
  if (balance <= 0 || !oldestDueDate) return "Current";
  const days = Math.floor((Date.now() - new Date(oldestDueDate).getTime()) / 86400000);
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  return "60+";
}