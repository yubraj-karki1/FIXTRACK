export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface TotpSetupRequestDto {
  userId: string;
}

export interface TotpVerifyRequestDto {
  userId: string;
  token: string;
}

/** Used for TOTP setup-confirmation and disable, which both also require the account password. */
export interface TotpConfirmRequestDto extends TotpVerifyRequestDto {
  currentPassword: string;
}

export interface TotpRecoveryRequestDto {
  userId: string;
  recoveryCode: string;
}

export interface ForgotPasswordRequestDto {
  email: string;
}

export interface PasswordResetRequestDto {
  email: string;
  code: string;
  newPassword: string;
}

export interface PasswordExpiredChangeRequestDto {
  userId: string;
  newPassword: string;
}
