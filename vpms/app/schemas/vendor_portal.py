import uuid

from pydantic import BaseModel, EmailStr


class ActivatePortalResponse(BaseModel):
    user_id: uuid.UUID
    vendor_id: uuid.UUID
    email: EmailStr
    # Dev-mode only: a real system would email/SMS this, never return it in the response.
    temp_password: str


class LoginStep1Request(BaseModel):
    email: EmailStr
    password: str


class LoginStep1Response(BaseModel):
    pre_auth_token: str
    # Dev-mode only stub: a real OTP would be sent via SMS/email, not returned here.
    otp_code_dev_only: str
    expires_in_seconds: int


class VerifyOtpRequest(BaseModel):
    pre_auth_token: str
    code: str


class VerifyOtpResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProfileStatusResponse(BaseModel):
    vendor_id: uuid.UUID
    complete: bool
    mandatory_documents: list[str]
    verified_documents: list[str]
    missing_or_unverified: list[str]
