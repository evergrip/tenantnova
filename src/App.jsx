import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import TenantNovaLayout from '@/components/tenantnova/TenantNovaLayout';
import Home from '@/pages/Home';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import PropertiesUnits from '@/pages/admin/PropertiesUnits';
import TenantsLeases from '@/pages/admin/TenantsLeases';
import LeaseParticipants from '@/pages/admin/LeaseParticipants';
import AuditLogs from '@/pages/admin/AuditLogs';
import OrganizationSettings from '@/pages/admin/OrganizationSettings';
import PortfolioLedger from '@/pages/admin/PortfolioLedger';
import LeaseLedgerDetail from '@/pages/admin/LeaseLedgerDetail';
import ArrearsView from '@/pages/admin/ArrearsView';
import AdminMaintenance from '@/pages/admin/Maintenance';
import AdminNotices from '@/pages/admin/Notices';
import DocumentCenter from '@/pages/admin/DocumentCenter';
import LeaseDocuments from '@/pages/admin/LeaseDocuments';
import TenantDocuments from '@/pages/admin/TenantDocuments';
import TenantDashboard from '@/pages/tenant/TenantDashboard';
import MyLease from '@/pages/tenant/MyLease';
import Profile from '@/pages/tenant/Profile';
import TenantLedger from '@/pages/tenant/TenantLedger';
import TenantMaintenance from '@/pages/tenant/Maintenance';
import TenantNotices from '@/pages/tenant/Notices';
import Documents from '@/pages/tenant/Documents';
import ContactManager from '@/pages/tenant/ContactManager';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<TenantNovaLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/properties" element={<PropertiesUnits />} />
        <Route path="/admin/tenants-leases" element={<TenantsLeases />} />
        <Route path="/admin/lease-participants" element={<LeaseParticipants />} />
        <Route path="/admin/ledger" element={<PortfolioLedger />} />
        <Route path="/admin/ledger/lease/:leaseId" element={<LeaseLedgerDetail />} />
        <Route path="/admin/arrears" element={<ArrearsView />} />
        <Route path="/admin/maintenance" element={<AdminMaintenance />} />
        <Route path="/admin/notices" element={<AdminNotices />} />
        <Route path="/admin/documents" element={<DocumentCenter />} />
        <Route path="/admin/documents/lease/:leaseId" element={<LeaseDocuments />} />
        <Route path="/admin/documents/tenant/:tenantId" element={<TenantDocuments />} />
        <Route path="/admin/audit-logs" element={<AuditLogs />} />
        <Route path="/admin/settings" element={<OrganizationSettings />} />
        <Route path="/tenant" element={<TenantDashboard />} />
        <Route path="/tenant/lease" element={<MyLease />} />
        <Route path="/tenant/ledger" element={<TenantLedger />} />
        <Route path="/tenant/maintenance" element={<TenantMaintenance />} />
        <Route path="/tenant/notices" element={<TenantNotices />} />
        <Route path="/tenant/documents" element={<Documents />} />
        <Route path="/tenant/profile" element={<Profile />} />
        <Route path="/tenant/contact" element={<ContactManager />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App