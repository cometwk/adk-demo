package auth

// 前端包含 codes.ts, 后端包含 codes 对应的 api
var defaultCodeEntries = []CodeEntry{
	// pass
	{Code: 0, Title: "登录用户", Url: "/user/*"},
	{Code: 0, Title: "安全操作码", Url: "/secretcode/verify"},
	// {Code: 0, Title: "CRUD", Url: "/p_key/*"},
	// {Code: 0, Title: "CRUD", Url: "/chan/*"},
	// {Code: 0, Title: "CRUD", Url: "/chan-merch/*"},
	// {Code: 0, Title: "CRUD", Url: "/rate/*"},
	// {Code: 0, Title: "CRUD", Url: "/system/*"},

	// 商户管理
	{Code: 6001, Title: "商户列表", Url: "/merch/*"},
	{Code: 6002, Title: "进件管理", Url: "/paper/*"},

	// 订单管理
	{Code: 6011, Title: "订单流水", Url: "/order/*"},
	{Code: 6012, Title: "订单统计", Url: "/order/stats"},

	// 代理商管理
	{Code: 6021, Title: "代理商列表", Url: "/agent/*"},
	{Code: 6022, Title: "提现审核", Url: "/request/*"},

	// 通道管理
	{Code: 6031, Title: "通道列表", Url: "/chan/*"},
	{Code: 6032, Title: "通道分析", Url: "/chan/*"},

	// 商户
	{Code: 7001, Title: "订单流水", Url: "/m/order"},
	{Code: 7002, Title: "订单统计", Url: "/m/order/stats"},

	// 代理商
	{Code: 7101, Title: "钱包流水", Url: "/a/wallet"},
	{Code: 7102, Title: "提现申请", Url: "/a/withdraw-apply"},

	// 系统功能
	{Code: 9000, Title: "用户管理", Url: "/system/user/*"},
	{Code: 9010, Title: "访问控制", Url: "/system/acl/*"},
	{Code: 9020, Title: "登录历史", Url: "/system/history/*"},
	{Code: 9020, Title: "登录历史-2", Url: "/table/signin_history/*"},
	{Code: 9025, Title: "操作审计", Url: "/system/ops/*"},
	{Code: 9025, Title: "操作审计-2", Url: "/table/ops/*"},
	{Code: 9030, Title: "系统事件", Url: "/system/event/*"},
	{Code: 9040, Title: "系统设置", Url: "/system/setting/*"},
	{Code: 9041, Title: "字典管理", Url: "/system/dict/*"},
	{Code: 9041, Title: "字典管理-2", Url: "/table/dict_cats/*"},
	{Code: 9041, Title: "字典管理-3", Url: "/table/dicts/*"},
	{Code: 9050, Title: "定时任务", Url: "/system/task/*"},
	{Code: 9050, Title: "定时任务实例", Url: "/table/task_inst/*"},
	{Code: 9051, Title: "Job队列管理", Url: "/system/job/*"},
	{Code: 9052, Title: "Job历史记录", Url: "/system/job/*"},
	{Code: 9060, Title: "层级管理", Url: "/system/node/*"},
	{Code: 9070, Title: "系统公告", Url: "/system/bulletin/*"},
	{Code: 9999, Title: "关于系统", Url: "/about/*"},

	// bpm管理
	{Code: 9100, Title: "流程管理", Url: "/bpm/process/*"},
	{Code: 9101, Title: "流程定义", Url: "/bpm/procdef/*"},
	{Code: 9102, Title: "流程任务", Url: "/bpm/task/*"},
	{Code: 9103, Title: "流程历史", Url: "/bpm/actinst/*"},

	// 运维工具

	// 运维工具
	{Code: 9901, Title: "日志管理", Url: "/system/log/*"},

	// 业务
	{Code: 100, Title: "首页", Url: "/"},
	{Code: 101, Title: "业务办理", Url: "/inst/add"},
	{Code: 102, Title: "A", Url: "/a"},
	{Code: 103, Title: "B", Url: "/a"},
	{Code: 104, Title: "C-x", Url: "/c"},

	{Code: 6100, Title: "用户管理", Url: "/table/users/*"},
	{Code: 6101, Title: "指标管理", Url: "/table/p_key/*"},
	{Code: 6102, Title: "化验单管理", Url: "/table/p_sheet/*"},
	{Code: 6103, Title: "模版", Url: "/table/p_schema/*"},
	{Code: 6104, Title: "日志管理", Url: "/table/p_post/*"},

	// code = 0, pass all table/*
	{Code: 0, Title: "DataTable", Url: "/table/*"},
	{Code: 0, Title: "bpm", Url: "/bpm/do/*"},
	{Code: 0, Title: "agent", Url: "/a/profit/*"},
	{Code: 0, Title: "merchant", Url: "/m/*"},
	{Code: 0, Title: "saas", Url: "/s/*"},
	// {Code: 7002, Title: "Cline AI", Url: "/table/p_key/*"},

	// 忽略权限检查的 url
	{Code: 0, Title: "preview", Url: "/preview/*"},
}
