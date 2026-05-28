import axios from "axios";

// ==================== 日志搜索 ====================

export interface LogSearchParams {
  page?: number;
  pagesize?: number;
  file?: string;
  q?: string;
  [key: string]: string | number | undefined;
}

export interface LogSearchResponse {
  data: Record<string, any>[];
  page: number;
  pagesize: number;
  total: number;
}

export function searchLog(params?: LogSearchParams) {
  return axios.get(`/admin/system/log/search`, { params }) as Promise<LogSearchResponse>;
}

// ==================== 日志文件列表 ====================

export interface LogFile {
  filename: string;
  mod_time: string;
  gz: boolean;
}

export function listLogFiles() {
  return axios.get(`/admin/system/log/list`) as Promise<LogFile[]>;
}

