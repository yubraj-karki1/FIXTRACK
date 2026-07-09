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
