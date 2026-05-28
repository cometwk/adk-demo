// @ts-ignore
import axios from 'axios'

export interface SmsTestInput {
  mobile: string
  textno: number
  params: Record<string, string>
}

export function smsSendTest(input: SmsTestInput) {
  return axios.post(`/admin/system/sms/test`, input) as Promise<void>
}

export interface SmsTest2Input {
  mobile: string // 手机号
  name: string // 商户名称
  apply: string // 进件人
  rate: number // 费率, 十万分比率
}

export function smsSendTest2(input: SmsTest2Input) {
  return axios.post(`/admin/system/sms/test2`, input) as Promise<void>
}