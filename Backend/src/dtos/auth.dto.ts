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
