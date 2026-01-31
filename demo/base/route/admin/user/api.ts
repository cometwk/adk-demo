import axios from "axios";

// ==================== 用户信息 ====================

export interface UserInfo {
  uuid: string;
  userid: string;
  avatar: string;
  name: string;
  email: string;
  mobile: string;
  address: string;
  secretcode_isset: boolean;
  totp_isset: boolean;
  noti_popup: boolean;
  noti_browser: boolean;
  noti_mail: boolean;
  acl_features: string[];
  acl_allows: Array<{
    code: string;
    iread: boolean;
    iwrite: boolean;
    iadmin: boolean;
  }>;
}

export function getUserInfo() {
  return axios.get(`/admin/user/info`) as Promise<UserInfo>;
}

// ==================== 设备信息 ====================

export interface Device {
  os: string;
  browser: string;
}

export function getDevices() {
  return axios.get(`/admin/user/devices`) as Promise<Device[]>;
}

// ==================== 地理位置信息 ====================

export interface GeoLocation {
  name: string;
  longitude: number;
  latitude: number;
}

export function getGeo() {
  return axios.get(`/admin/user/geo`) as Promise<GeoLocation[]>;
}

// ==================== 登录历史 ====================

export interface SigninHistory {
  create_at: string;
  ip: string;
  country: string;
  province: string;
  city: string;
  district: string;
  longitude: number;
  latitude: number;
  os: string;
  browser: string;
  acttype: string;
  oauthp: string;
}

export function getSigninList() {
  return axios.get(`/admin/user/signinlist`) as Promise<SigninHistory[]>;
}

// ==================== 更新用户信息 ====================

export interface UpdateNameInput {
  name: string;
}

export function updateName(input: UpdateNameInput) {
  return axios.post(`/admin/user/name`, input) as Promise<void>;
}

export interface UpdateUseridInput {
  userid: string;
}

export function updateUserid(input: UpdateUseridInput) {
  return axios.post(`/admin/user/userid`, input) as Promise<void>;
}

export interface UpdateEmailInput {
  email: string;
}

export function updateEmail(input: UpdateEmailInput) {
  return axios.post(`/admin/user/email`, input) as Promise<void>;
}

export interface UpdateMobileInput {
  mobile: string;
}

export function updateMobile(input: UpdateMobileInput) {
  return axios.post(`/admin/user/mobile`, input) as Promise<void>;
}

export interface UpdateAddressInput {
  address: string;
}

export function updateAddress(input: UpdateAddressInput) {
  return axios.post(`/admin/user/address`, input) as Promise<void>;
}

export interface UpdatePasswdInput {
  oldPassword: string;
  newPassword: string;
}

export function updatePasswd(input: UpdatePasswdInput) {
  return axios.post(`/admin/user/passwd`, input) as Promise<void>;
}

export interface UpdateSecretcodeInput {
  secretcode: string;
}

export function updateSecretcode(input: UpdateSecretcodeInput) {
  return axios.post(`/admin/user/secretcode`, input) as Promise<void>;
}

// ==================== 头像 ====================

export interface UpdateAvatarInput {
  avatar: File;
}

export function updateAvatar(input: UpdateAvatarInput) {
  const formData = new FormData();
  formData.append("avatar", input.avatar);
  return axios.post(`/admin/user/avatar`, formData) as Promise<string>;
}

// ==================== OTP ====================

export interface OTPURLResponse {
  url: string;
  secret: string;
}

export function getOTPURL() {
  return axios.get(`/admin/user/otp/url`) as Promise<OTPURLResponse>;
}

export interface OTPVerifyInput {
  code: string;
  secret: string;
}

export function verifyOTP(input: OTPVerifyInput) {
  return axios.post(`/admin/user/otp/verify`, input) as Promise<void>;
}

export interface OTPCheckInput {
  code: string;
}

export interface OTPCheckResponse {
  valid: boolean;
}

export function checkOTP(input: OTPCheckInput) {
  return axios.post(
    `/admin/user/otp/check`,
    input
  ) as Promise<OTPCheckResponse>;
}
