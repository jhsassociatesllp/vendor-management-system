import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { AppShell } from '@/components/shared/AppShell'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { ROUTES } from '@/lib/nav-config'
import { LoginPage } from '@/features/auth/LoginPage'
import { VendorLoginPage } from '@/features/auth/VendorLoginPage'
import { DashboardPage } from '@/features/auth/DashboardPage'
import { VendorRequestFormPage } from '@/features/vendor/VendorRequestFormPage'
import { VendorRequestsListPage } from '@/features/vendor/VendorRequestsListPage'
import { RequestDetailPage } from '@/features/vendor/RequestDetailPage'
import { ItemCodesPage } from '@/features/vendor/ItemCodesPage'
import { VendorDashboardPage } from '@/features/vendor-portal/VendorDashboardPage'
import { VendorKycUploadPage } from '@/features/vendor-portal/VendorKycUploadPage'
import { VendorBankChangePage } from '@/features/vendor-portal/VendorBankChangePage'
import { NotificationsPage } from '@/features/vendor-portal/NotificationsPage'
import { KycReviewQueuePage } from '@/features/vendor-portal/KycReviewQueuePage'
import { BankChangeReviewPage } from '@/features/vendor-portal/BankChangeReviewPage'
import { BudgetHeadsPage } from '@/features/procurement/BudgetHeadsPage'
import { PoCreatePage } from '@/features/procurement/PoCreatePage'
import { PoListPage } from '@/features/procurement/PoListPage'
import { PoDetailPage } from '@/features/procurement/PoDetailPage'
import { InvoicesListPage } from '@/features/procurement/InvoicesListPage'
import { InvoiceDetailPage } from '@/features/procurement/InvoiceDetailPage'
import { VendorPoListPage } from '@/features/procurement/VendorPoListPage'
import { VendorInvoiceSubmitPage } from '@/features/procurement/VendorInvoiceSubmitPage'
import { VendorInvoicesListPage } from '@/features/procurement/VendorInvoicesListPage'
import { MyApprovalQueuePage } from '@/features/approvals/MyApprovalQueuePage'
import { InvoiceApprovalDetailPage } from '@/features/approvals/InvoiceApprovalDetailPage'
import { DelegationSetupPage } from '@/features/approvals/DelegationSetupPage'
import { DoaMatrixPage } from '@/features/approvals/DoaMatrixPage'
import { EscalationsPage } from '@/features/approvals/EscalationsPage'
import { PaymentQueuePage } from '@/features/approvals/PaymentQueuePage'
import { PaymentRecordFormPage } from '@/features/approvals/PaymentRecordFormPage'
import { PaymentConfirmQueuePage } from '@/features/approvals/PaymentConfirmQueuePage'
import { MsmeAlertsPage } from '@/features/approvals/MsmeAlertsPage'
import { VendorInvoiceTrackPage } from '@/features/approvals/VendorInvoiceTrackPage'
import { MisDashboardPage } from '@/features/mis/MisDashboardPage'
import { ReportsPage } from '@/features/mis/ReportsPage'
import { ReportViewerPage } from '@/features/mis/ReportViewerPage'
import { AuditTrailPage } from '@/features/mis/AuditTrailPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
})

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route path={ROUTES.vendorLogin} element={<VendorLoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path={ROUTES.dashboard} element={<DashboardPage />} />
          <Route path={ROUTES.vendorDashboard} element={<VendorDashboardPage />} />
          <Route path={ROUTES.vendorKycUpload} element={<VendorKycUploadPage />} />
          <Route path={ROUTES.vendorBankChange} element={<VendorBankChangePage />} />
          <Route path={ROUTES.vendorNotifications} element={<NotificationsPage />} />
          <Route path={ROUTES.kycReviewQueue} element={<KycReviewQueuePage />} />
          <Route path={ROUTES.bankChangeReview} element={<BankChangeReviewPage />} />

          <Route
            path={ROUTES.vendorRequestForm}
            element={<ProtectedRoute roles={['Dept. Manager', 'Partner / VP', 'System Admin']} />}
          >
            <Route index element={<VendorRequestFormPage />} />
          </Route>
          <Route path={ROUTES.vendorRequestsList} element={<VendorRequestsListPage />} />
          <Route path={ROUTES.requestDetail()} element={<RequestDetailPage />} />
          <Route path={ROUTES.itemCodes} element={<ItemCodesPage />} />

          <Route path={ROUTES.budgetHeads} element={<BudgetHeadsPage />} />
          <Route
            path={ROUTES.poCreate}
            element={<ProtectedRoute roles={['Dept. Manager', 'Accounts Executive', 'System Admin']} />}
          >
            <Route index element={<PoCreatePage />} />
          </Route>
          <Route path={ROUTES.poList} element={<PoListPage />} />
          <Route path={ROUTES.poDetail()} element={<PoDetailPage />} />
          <Route path={ROUTES.invoicesList} element={<InvoicesListPage />} />
          <Route path={ROUTES.invoiceDetail()} element={<InvoiceDetailPage />} />
          <Route path={ROUTES.vendorPoList} element={<VendorPoListPage />} />
          <Route path={ROUTES.vendorInvoiceSubmit} element={<VendorInvoiceSubmitPage />} />
          <Route path={ROUTES.vendorInvoicesList} element={<VendorInvoicesListPage />} />

          <Route path={ROUTES.myApprovalQueue} element={<MyApprovalQueuePage />} />
          <Route path={ROUTES.invoiceApprovalDetail()} element={<InvoiceApprovalDetailPage />} />
          <Route path={ROUTES.delegationSetup} element={<DelegationSetupPage />} />
          <Route path={ROUTES.doaMatrix} element={<DoaMatrixPage />} />
          <Route path={ROUTES.escalations} element={<EscalationsPage />} />
          <Route path={ROUTES.paymentQueue} element={<PaymentQueuePage />} />
          <Route path={ROUTES.paymentRecordForm()} element={<PaymentRecordFormPage />} />
          <Route path={ROUTES.paymentConfirmQueue} element={<PaymentConfirmQueuePage />} />
          <Route path={ROUTES.msmeAlerts} element={<MsmeAlertsPage />} />
          <Route path={ROUTES.vendorInvoiceTrack} element={<VendorInvoiceTrackPage />} />

          <Route path={ROUTES.misDashboard} element={<MisDashboardPage />} />
          <Route path={ROUTES.reports} element={<ReportsPage />} />
          <Route path={ROUTES.reportViewer} element={<ReportViewerPage />} />
          <Route path={ROUTES.auditTrail} element={<AuditTrailPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />
      <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
