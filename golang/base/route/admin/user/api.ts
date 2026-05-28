// @ts-nocheck
import axios from "axios";
// import axios from '../../utils/axios'

// ==================== 用户信息 ====================

export interface UserInfoResponse {
  uuid: string; // 用户 UUID（users.uuid）
  userid: string; // 登录名（users.userid）
  avatar: string; // 头像资源 UUID（由 /admin/user/avatar 返回）
  name: string; // 用户姓名
  email: string; // 邮箱地址
  mobile: string; // 手机号
  address: string; // 联系地址
  secretcode_isset: boolean; // 是否已设置安全操作码（secretcode）
  totp_isset: boolean; // 是否已设置 TOTP 双因素密钥（totp_secret）
  noti_popup: boolean; // 是否开启站内弹窗通知
  noti_browser: boolean; // 是否开启浏览器通知
  noti_mail: boolean; // 是否开启邮件通知
  acl_features: string[]; // 当前用户可访问的 ACL 功能清单
  acl_allows: Array<{
    code: string; // 权限项编码（ACL code）
    iread: boolean; // 是否有读取权限
    iwrite: boolean; // 是否有写入权限
    iadmin: boolean; // 是否有管理权限
  }>; // 当前用户在各 ACL 代码下的读写管理权限
  acl_code: number // 角色代码 0: 管理员 1: 代理商 2: 商户 3: 服务商 
  bind_no: string // 绑定编号
  bind_name: string // 绑定名称
}

export function getUserInfo() {
  return axios.get(`/admin/user/info`) as Promise<UserInfoResponse>;
}

// ==================== 设备信息 ====================

export interface Device {
  os: string; // 操作系统名称（由 UA 解析，去重后返回）
  browser: string; // 浏览器名称（由 UA 解析，去重后返回）
}

export function getDevices() {
  return axios.get(`/admin/user/devices`) as Promise<Device[]>;
}

// ==================== 地理位置信息 ====================

export interface GeoLocation {
  name: string; // 地点展示名（country/province/city 拼接）
  longitude: number; // 该地点登录记录的平均经度
  latitude: number; // 该地点登录记录的平均纬度
}

export function getGeo() {
  return axios.get(`/admin/user/geo`) as Promise<GeoLocation[]>;
}

// ==================== 登录历史 ====================

export interface SigninHistory {
  create_at: string; // 登录时间（create_at）
  ip: string; // 登录 IP
  country: string; // 国家
  province: string; // 省/州
  city: string; // 城市
  district: string; // 区/县
  longitude: number; // 经度
  latitude: number; // 纬度
  os: string; // 操作系统（名称 + 版本）
  browser: string; // 浏览器（名称 + 版本）
  acttype: string; // 行为类型（signin_history.acttype）
  oauthp: string; // OAuth 提供方标识（signin_history.oauthp）
}

export function getSigninList() {
  return axios.get(`/admin/user/signinlist`) as Promise<SigninHistory[]>;
}

// ==================== 更新用户信息 ====================

export interface UpdateNameInput {
  name: string; // 新姓名
}

export function updateName(input: UpdateNameInput) {
  return axios.post(`/admin/user/name`, input) as Promise<void>;
}

export interface UpdateUseridInput {
  userid: string; // 新登录名（需唯一）
}

export function updateUserid(input: UpdateUseridInput) {
  return axios.post(`/admin/user/userid`, input) as Promise<void>;
}

export interface UpdateEmailInput {
  email: string; // 新邮箱地址
}

export function updateEmail(input: UpdateEmailInput) {
  return axios.post(`/admin/user/email`, input) as Promise<void>;
}

export interface UpdateMobileInput {
  mobile: string; // 新手机号（11 位，以 1 开头）
}

export function updateMobile(input: UpdateMobileInput) {
  return axios.post(`/admin/user/mobile`, input) as Promise<void>;
}

export interface UpdateAddressInput {
  address: string; // 新地址（可为空字符串）
}

export function updateAddress(input: UpdateAddressInput) {
  return axios.post(`/admin/user/address`, input) as Promise<void>;
}

export interface UpdatePasswdInput {
  oldPassword: string; // 原登录密码
  newPassword: string; // 新登录密码
}

export function updatePasswd(input: UpdatePasswdInput) {
  return axios.post(`/admin/user/passwd`, input) as Promise<void>;
}

export interface UpdateSecretcodeInput {
  secretcode: string; // 新安全操作码（6 位数字）
}

export function updateSecretcode(input: UpdateSecretcodeInput) {
  return axios.post(`/admin/user/secretcode`, input) as Promise<void>;
}

// ==================== 头像 ====================

export interface UpdateAvatarInput {
  avatar: File; // 上传头像文件（后端按 PNG 解码并重编码）
}

export function updateAvatar(input: UpdateAvatarInput) {
  const formData = new FormData();
  formData.append("avatar", input.avatar);
  return axios.post(`/admin/user/avatar`, formData) as Promise<string>;
}

// ==================== OTP ====================

export interface OTPURLResponse {
  url: string; // otpauth URL（用于生成二维码）
  secret: string; // TOTP 密钥（需配合 code 调 /otp/verify 落库）
}

export function getOTPURL() {
  return axios.get(`/admin/user/otp/url`) as Promise<OTPURLResponse>;
}

export interface OTPVerifyInput {
  code: string; // 当前 TOTP 动态验证码
  secret: string; // 待保存的 TOTP secret（来自 /otp/url）
}

export function verifyOTP(input: OTPVerifyInput) {
  return axios.post(`/admin/user/otp/verify`, input) as Promise<void>;
}

export interface OTPCheckInput {
  code: string; // 当前 TOTP 动态验证码
}

export interface OTPCheckResponse {
  valid: boolean; // 验证码是否有效
}

export function checkOTP(input: OTPCheckInput) {
  return axios.post(
    `/admin/user/otp/check`,
    input
  ) as Promise<OTPCheckResponse>;
}
