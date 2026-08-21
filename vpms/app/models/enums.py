import enum


class VendorRequestStatus(str, enum.Enum):
    SUBMITTED = "Submitted"
    ACCOUNTS_REVIEW = "Accounts_Review"
    PENDING_PARTNER_APPROVAL = "Pending_Partner_Approval"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    ARCHIVED = "Archived"


class VendorCategory(str, enum.Enum):
    PROFESSIONAL = "Professional"
    SERVICE = "Service"
    GOODS_SUPPLIER = "Goods Supplier"
    RECURRING = "Recurring"


class BillingFrequency(str, enum.Enum):
    MONTHLY = "Monthly"
    QUARTERLY = "Quarterly"
    MILESTONE = "Milestone"
    AD_HOC = "Ad_hoc"


class PORequirement(str, enum.Enum):
    MANDATORY = "Mandatory"
    OPTIONAL = "Optional"
    NOT_REQUIRED = "Not_Required"


class AgreementStatus(str, enum.Enum):
    ACTIVE = "Active"
    EXPIRED = "Expired"
    TERMINATED = "Terminated"


class PricingType(str, enum.Enum):
    FIXED = "Fixed"
    PER_UNIT = "Per_Unit"
    MILESTONE = "Milestone"
    VOLUME_TIERED = "Volume_Tiered"


class MilestoneStatus(str, enum.Enum):
    PENDING = "Pending"
    ACHIEVED = "Achieved"
    INVOICED = "Invoiced"


class AmendmentStatus(str, enum.Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class OtpPurpose(str, enum.Enum):
    LOGIN = "login"


class KycDocumentType(str, enum.Enum):
    PAN = "PAN"
    GST_CERTIFICATE = "GST_Certificate"
    MSME_CERTIFICATE = "MSME_Certificate"
    BANK_PROOF = "Bank_Proof"
    MOA_INCORPORATION = "MOA_Incorporation"
    BENEFICIAL_OWNERSHIP = "Beneficial_Ownership"
    ITR_AUDITED_FINANCIALS = "ITR_Audited_Financials"


class KycDocumentStatus(str, enum.Enum):
    PENDING_REVIEW = "Pending_Review"
    VERIFIED = "Verified"
    REJECTED = "Rejected"


class BankChangeStatus(str, enum.Enum):
    PENDING_FIRST_APPROVAL = "Pending_First_Approval"
    PENDING_SECOND_APPROVAL = "Pending_Second_Approval"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class BudgetPeriodType(str, enum.Enum):
    MONTHLY = "Monthly"
    QUARTERLY = "Quarterly"
    ANNUAL = "Annual"


class PurchaseOrderStatus(str, enum.Enum):
    PENDING_APPROVAL = "Pending_Approval"
    APPROVED = "Approved"
    VENDOR_ACKNOWLEDGED = "Vendor_Acknowledged"
    REJECTED = "Rejected"
    CANCELLED = "Cancelled"
    LAPSED = "Lapsed"
    CLOSED = "Closed"


class POAmendmentStatus(str, enum.Enum):
    PENDING_APPROVAL = "Pending_Approval"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class GrnScnType(str, enum.Enum):
    GRN = "GRN"
    SCN = "SCN"


class InvoiceStatus(str, enum.Enum):
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    # Phase 4A: parameterised approval workflow.
    L1_VERIFICATION = "L1_Verification"
    L2_REVIEW = "L2_Review"
    L3_APPROVAL = "L3_Approval"
    L4_FINANCE_APPROVAL = "L4_Finance_Approval"
    APPROVED_FOR_PAYMENT = "Approved_For_Payment"
    QUERY_RAISED = "Query_Raised"
    RETURNED_TO_VENDOR = "Returned_To_Vendor"
    REJECTED = "Rejected"
    ON_HOLD = "On_Hold"
    # Phase 4B: payment recording.
    PAID = "Paid"


class ApprovalLevel(str, enum.Enum):
    L1 = "L1"
    L2 = "L2"
    L3 = "L3"
    L4 = "L4"


class ApprovalStageStatus(str, enum.Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"
    REJECTED = "Rejected"
    RETURNED = "Returned"
    QUERY_RAISED = "Query_Raised"
    SKIPPED = "Skipped"


class QueryStatus(str, enum.Enum):
    OPEN = "Open"
    RESPONDED = "Responded"


class PaymentMode(str, enum.Enum):
    NEFT = "NEFT"
    RTGS = "RTGS"
    IMPS = "IMPS"
    UPI = "UPI"
    CHEQUE = "Cheque"


class PaymentStatus(str, enum.Enum):
    MAKER_RECORDED = "Maker_Recorded"
    CHECKER_CONFIRMED = "Checker_Confirmed"
    REJECTED = "Rejected"


class InvoiceDocumentType(str, enum.Enum):
    INVOICE_PDF = "Invoice_PDF"
    GRN_SCN_ACK = "GRN_SCN_Ack"
    WORK_COMPLETION_PROOF = "Work_Completion_Proof"
    TIMESHEET = "Timesheet"
    MEASUREMENT_SHEET = "Measurement_Sheet"
    PO_COPY = "PO_Copy"


class AuditAction(str, enum.Enum):
    CREATE = "Create"
    UPDATE = "Update"
    APPROVE = "Approve"
    REJECT = "Reject"
    DELETE = "Delete"
    VIEW = "View"
    LOGIN = "Login"
    LOGOUT = "Logout"
    LOGIN_FAILED = "Login_Failed"
    DOCUMENT_UPLOAD = "Document_Upload"
    SYSTEM = "System"
