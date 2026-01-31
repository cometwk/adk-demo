import axios from "axios";

// ==================== OTP 验证 ====================

export interface OTPVerifyInput {
  code: string;
  trust?: boolean;
  historyid?: string;
}

export interface OTPVerifyResponse {
  token: string;
}

export function verifyOTP(input: OTPVerifyInput) {
  return axios.post(`/login/signin/otp/verify`, input) as Promise<OTPVerifyResponse>;
}

