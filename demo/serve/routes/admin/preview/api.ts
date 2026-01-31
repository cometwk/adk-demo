// @ts-nocheck
import { z } from 'zod'
import axios from 'axios'

// ==================== 进件申请提交 ====================

export interface SaasApplyRequestInput {
  id: string
}

export function saasApplyRequest(input: SaasApplyRequestInput) {
  return axios.post(`/admin/s/apply/request`, input) as Promise<void>
}

// ==================== 进件申请查询 ====================

export interface SaasApplyQueryInput {
  id: string
}

export interface SaasApplyQueryResult {
  Status: number // 0-未提交审核 1-待审核 2-审核通过 3-审核拒绝
  StatusReason: string // 拒绝原因
}

export function saasApplyQuery(input: SaasApplyQueryInput) {
  return axios.post(`/admin/s/apply/query`, input) as Promise<SaasApplyQueryResult>
}

// ==================== CR识别 ====================

// 身份证
export const IdCardSchema = z
  .object({
    name: z.string().nullable().describe('姓名'),
    gender: z.enum(['男', '女']).nullable().describe('性别'),
    ethnicity: z.string().nullable().describe('民族'),
    birthDate: z
      .string()
      .regex(/^\d{4}年\d{2}月\d{2}日$/)
      .nullable()
      .describe('出生日期'),
    address: z.string().nullable().describe('住址'),
    idNumber: z
      .string()
      .regex(/^\d{17}[\dXx]$/)
      .nullable()
      .describe('公民身份号码'),
    issuingAuthority: z.string().nullable().describe('签发机关'),
    validPeriod: z
      .string()
      .regex(/^\d{4}\.\d{2}\.\d{2}–\d{4}\.\d{2}\.\d{2}$/)
      .nullable()
      .describe('有效期限'),
  })
  .describe('身份证OCR结果信息')

export const LicenseSchema = z
  .object({
    unifiedSocialCreditCode: z.string().optional().describe('统一社会信用代码'),
    companyName: z.string().optional().describe('公司名称'),
    type: z.string().optional().describe('企业类型'),
    legalRepresentative: z.string().optional().describe('法定代表人'),
    registeredCapital: z.string().optional().describe('注册资本（含单位，如“100万元人民币”）'),
    establishmentDate: z.string().optional().describe('成立日期（如“2020年05月12日”）'),
    businessTerm: z.string().optional().describe('营业期限（如“2020年05月12日至长期”）'),
    address: z.string().optional().describe('住所/注册地址'),
    businessScope: z.string().optional().describe('经营范围'),
    registrationAuthority: z.string().optional().describe('登记机关'),
    issueDate: z.string().optional().describe('发照日期'),
  })
  .describe('营业执照OCR结果信息')

export type IdCard = z.infer<typeof IdCardSchema>
export type License = z.infer<typeof LicenseSchema>

type OcrRequestInput = {
  fileId: string
  type: 'idcard' | 'license'
}

type OcrRequestResult = {
  type: 'idcard' | 'license'
  idcard?: IdCard
  license?: License
}

export function ocrRequest(input: OcrRequestInput) {
  return axios.post(`/admin/s/apply/ocr`, input) as Promise<OcrRequestResult>
}
