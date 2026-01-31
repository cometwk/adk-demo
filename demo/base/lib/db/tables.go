package db

import (
	"time"
)

// 访问控制角色
type Acl struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	Code     int       `json:"code"      xorm:"int unique notnull comment('菜单代码')"`
	Name     string    `json:"name"      xorm:"varchar(64) unique notnull comment('角色名称')"`
	Summary  string    `json:"summary"   xorm:"varchar(512) notnull comment('角色描述')"`
	Features string    `json:"features"  xorm:"text notnull comment('角色特征')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt time.Time `json:"update_at" xorm:"timestamp updated notnull comment('更新时间')"`
}

func (Acl) TableName() string {
	return "acl"
}

// 访问控制权限
type AclAllow struct {
	UUID   string `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	ACL    string `json:"acl"       xorm:"varchar(36) notnull comment('ACL角色UUID')"`
	Code   int    `json:"code"      xorm:"int notnull comment('菜单代码')"`
	Title  string `json:"title"     xorm:"varchar(64) notnull comment('菜单标题')"`
	URL    string `json:"url"       xorm:"varchar(128) notnull comment('访问路径')"` // 后台 API 路径？TODO
	IRead  bool   `json:"iread"     xorm:"bool iread notnull default true comment('读取权限')"`
	IWrite bool   `json:"iwrite"    xorm:"bool iwrite notnull default false comment('写入权限')"`
	IAdmin bool   `json:"iadmin"    xorm:"bool iadmin notnull default false comment('管理权限')"`
}

func (AclAllow) TableName() string {
	return "acl_allows"
}

// 图片设置
type ImageStore struct {
	Place    int    `json:"place"    xorm:"int notnull default 1 comment('位置')"` // 1.数据库 2.文件系统
	RootPath string `json:"rootpath" xorm:"varchar(256) notnull default '' comment('文件系统路径')"`
}

func (ImageStore) TableName() string {
	return "image_store"
}

// 图片
type Image struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt time.Time `json:"update_at" xorm:"timestamp updated notnull comment('更新时间')"`
	Place    int       `json:"place"     xorm:"int notnull default 1 comment('位置')"` // 1.数据库 2.文件系统
	Data     []byte    `json:"data"      xorm:"bytea notnull comment('图片数据')"`       // PostgreSQL, Sqlite
	Path     string    `json:"path"      xorm:"varchar(256) notnull default '' comment('文件系统路径')"`
	Mime     string    `json:"mime"      xorm:"varchar(128) notnull comment('MIME类型')"`
	ETag     string    `json:"etag"      xorm:"varchar(32) notnull comment('数据哈希')"`
}

func (Image) TableName() string {
	return "images"
}

///

// 用户
type User struct {
	UUID         string    `json:"uuid"           xorm:"varchar(36) pk notnull comment('UUID')"`
	SigninAt     time.Time `json:"signin_at"      xorm:"timestamp notnull comment('最后登录时间')"`
	Disabled     bool      `json:"disabled"       xorm:"bool notnull default false comment('是否禁用')"`
	Deleted      bool      `json:"deleted"        xorm:"bool notnull default false comment('是否删除')"`
	UserId       string    `json:"userid"         xorm:"varchar(128) userid notnull unique comment('登录名')"`
	Passwd       string    `json:"-"              xorm:"varchar(4096) notnull comment('密码')"` // 不返回密码
	Name         string    `json:"name"           xorm:"varchar(64) default '' comment('姓名')"`
	Avatar       string    `json:"avatar"         xorm:"varchar(36) default '' comment('头像')"`
	Email        string    `json:"email"          xorm:"varchar(128) notnull comment('邮箱地址')"`
	Mobile       string    `json:"mobile"         xorm:"varchar(16) notnull comment('手机号')"`
	IdNo         string    `json:"idno"           xorm:"varchar(32) idno notnull default '' comment('身份证')"`
	Address      string    `json:"address"        xorm:"varchar(256) default '' comment('联系地址')"`
	AcctName     string    `json:"acct_name"      xorm:"varchar(1024) default '' comment('账户名称')"`
	AcctNo       string    `json:"acct_no"        xorm:"varchar(128) default '' comment('账户编号')"`
	AcctIdno     string    `json:"acct_idno"      xorm:"varchar(64) default '' comment('银行账号身份证')"`
	AcctMobile   string    `json:"acct_mobile"    xorm:"varchar(16) default '' comment('银行账号手机号')"`
	AcctBankName string    `json:"acct_bank_name" xorm:"varchar(256) default '' comment('银行账号开户行')"`
	TFA          bool      `json:"tfa"            xorm:"boolean notnull default true comment('短信认证')"`
	ACL          string    `json:"acl"            xorm:"varchar(36) notnull comment('访问控制角色UUID')"`
	BindNo       string    `json:"bind_no"        xorm:"varchar(32) default '' comment('绑定商户或代理商编号')"`
	BindName     string    `json:"bind_name"      xorm:"varchar(64) default '' comment('绑定商户或代理商名称')"`
	SecretCode   string    `json:"secretcode"     xorm:"varchar(256) secretcode notnull default '' comment('安全操作码')"`
	TOTPSecret   string    `json:"totp_secret"    xorm:"varchar(256) notnull default '' comment('TOTP密钥')"`
	NSignin      int       `json:"n_signin"       xorm:"int n_signin notnull default 0 comment('总登录次数')"`
	NotiPopup    bool      `json:"noti_popup"     xorm:"boolean default 0 comment('弹出通知消息')"`
	NotiBrowser  bool      `json:"noti_browser"   xorm:"boolean default 0 comment('浏览器通知')"`
	NotiMail     bool      `json:"noti_mail"      xorm:"boolean default 0 comment('邮件通知')"`
	CreateAt     time.Time `json:"create_at"      xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt     time.Time `json:"update_at"      xorm:"timestamp updated notnull comment('更新时间')"`
}

func (User) TableName() string {
	return "users"
}

// 登录历史
type SigninHistory struct {
	UUID      string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	UserUUID  string    `json:"user_uuid" xorm:"varchar(36) notnull comment('用户UUID')"`
	UserId    string    `json:"userid"    xorm:"varchar(128) userid notnull comment('用户登录名')"`
	Name      string    `json:"name"      xorm:"varchar(64) notnull comment('姓名')"`
	IP        string    `json:"ip"        xorm:"varchar(128) notnull default '' comment('IP地址')"`
	Country   string    `json:"country"   xorm:"varchar(64) default '' comment('国家')"`
	Province  string    `json:"province"  xorm:"varchar(64) default '' comment('省')"`
	City      string    `json:"city"      xorm:"varchar(64) default '' comment('市')"`
	District  string    `json:"district"  xorm:"varchar(64) default '' comment('区')"`
	Longitude float64   `json:"longitude" xorm:"float default 0 comment('经度')"`
	Latitude  float64   `json:"latitude"  xorm:"float default 0 comment('纬度')"`
	UA        string    `json:"ua"        xorm:"varchar(512) notnull default '' comment('客户端UA')"`
	ClientId  string    `json:"clientid"  xorm:"varchar(36) clientid notnull comment('客户端ID')"`
	Trust     bool      `json:"trust"     xorm:"bool comment('是否信任设备')"`
	TFA       int       `json:"tfa"       xorm:"int default 0 comment('两因素认证方式')"`      // 0. 无 1. 短信 2. 动态密码
	ActType   int       `json:"act_type"  xorm:"int notnull default 1 comment('登录方式')"` // 1. 系统账号登录 2. 三方账号登录
	OAuthP    string    `json:"oauthp"    xorm:"varchar(32) oauthp notnull default '' comment('三方账号提供方')"`
	CreateAt  time.Time `json:"create_at"      xorm:"timestamp created notnull comment('创建时间')"`
}

func (SigninHistory) TableName() string {
	return "signin_history"
}

// 账号设置
type Account struct {
	Signupable   bool   `json:"signupable"   xorm:"bool default false comment('开放用户注册')"`
	SignupACL    string `json:"signupacl"    xorm:"varchar(36) default '' comment('用户注册角色')"`
	LookUserid   bool   `json:"lookuserid"   xorm:"bool default true comment('允许找回登录名')"`
	ResetPass    bool   `json:"resetpass"    xorm:"bool default true comment('允许找回密码')"`
	SessDuration int    `json:"sessduration" xorm:"int default 1440 comment('会话持续时间')"`
	JWTSignKey   string `json:"jwtsignkey"   xorm:"varchar(32) default '' comment('JWT 签名密钥')"`
	JWTSignKey2  string `json:"jwtsignkey2"  xorm:"varchar(32) default '' comment('JWT 签名密钥(旧)')"`
}

func (Account) TableName() string {
	return "account"
}

// 定时任务
type Task struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt time.Time `json:"update_at" xorm:"timestamp updated notnull comment('更新时间')"`
	Name     string    `json:"name"      xorm:"varchar(64) notnull comment('名称')"`
	Summary  string    `json:"summary"   xorm:"varchar(256) notnull comment('描述')"`
	Cron     string    `json:"cron"      xorm:"varchar(64) notnull comment('CRON表达式')"`
	Type     int       `json:"type"      xorm:"smallint notnull comment('类型')"`       // 1. 函数 2. 脚本 3. http-client
	Path     string    `json:"path"      xorm:"varchar(256) notnull comment('文件路径')"` // or 函数名
	LastFire time.Time `json:"last_fire" xorm:"timestamp notnull default current_timestamp comment('最后执行时间')"`
	NFire    int       `json:"nfire"     xorm:"int nfire notnull default 0 comment('执行次数')"`
	Disabled bool      `json:"disabled"  xorm:"boolean notnull default false comment('是否停用')"`
	Note     string    `json:"note"      xorm:"text comment('备注')"`
	// TODO: 考虑加入超时时间设置
}

func (Task) TableName() string {
	return "tasks"
}

type TaskInst struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt time.Time `json:"update_at" xorm:"timestamp updated notnull comment('更新时间')"`
	TaskUUID string    `json:"task_uuid" xorm:"varchar(36) notnull comment('任务UUID')"`
	TaskName string    `json:"task_name" xorm:"varchar(64) notnull comment('任务名称')"`
	TaskType int       `json:"task_type" xorm:"int notnull comment('任务类型')"`
	Code     int       `json:"code"      xorm:"int notnull default 0 comment('状态码')"` // 0 执行中 or http status code
	Message  string    `json:"message"   xorm:"text notnull default '' comment('消息')"`
	Elapsed  int       `json:"elapsed"   xorm:"int notnull default 0 comment('毫秒')"`
}

func (TaskInst) TableName() string {
	return "task_inst"
}

// 系统事件
type Event struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	Level    int       `json:"level"     xorm:"int notnull comment('事件级别')"`
	Title    string    `json:"title"     xorm:"varchar(256) notnull comment('事件标题')"`
	Message  string    `json:"message"   xorm:"text notnull comment('事件消息')"`
	Fresh    bool      `json:"fresh"     xorm:"bool notnull default true comment('是否未读')"`
}

func (Event) TableName() string {
	return "events"
}

// 邮件服务
type MTA struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt time.Time `json:"update_at" xorm:"timestamp updated notnull comment('更新时间')"`
	Name     string    `json:"name"      xorm:"varchar(32) notnull unique comment('名称')"`
	Host     string    `json:"host"      xorm:"varchar(128) notnull comment('主机')"`
	Port     int       `json:"port"      xorm:"int notnull default 465 comment('端口')"`
	SSLMode  bool      `json:"sslmode"   xorm:"boolean notnull default true comment('SSL模式')"`
	Sender   string    `json:"sender"    xorm:"varchar(128) notnull comment('发送地址')"`
	ReplyTo  string    `json:"replyto"   xorm:"varchar(128) comment('回复地址')"`
	Username string    `json:"username"  xorm:"varchar(128) comment('认证用户名')"`
	Passwd   string    `json:"passwd"    xorm:"varchar(128) comment('密码')"`
	CC       string    `json:"cc"        xorm:"text comment('抄送')"`
	BCC      string    `json:"bcc"       xorm:"text comment('密送')"`
	Prefix   string    `json:"prefix"    xorm:"varchar(128) default '' comment('标题前缀')"`
	SortNo   int       `json:"sortno"    xorm:"int unique comment('排序序号')"`
	NSent    int       `json:"nsent"     xorm:"int default 0 comment('发送量')"`
	Disabled bool      `json:"disabled"  xorm:"boolean default false comment('是否停用')"`
}

func (MTA) TableName() string {
	return "mtas"
}

// 短信服务
type SMS struct {
	UUID      string    `json:"uuid"       xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt  time.Time `json:"create_at"  xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt  time.Time `json:"update_at"  xorm:"timestamp updated notnull comment('更新时间')"`
	ISP       string    `json:"isp"        xorm:"varchar(16) notnull comment('运营商')"`
	ISPName   string    `json:"isp_name"   xorm:"varchar(64) notnull comment('运营商名称')"`
	AppId     string    `json:"appid"      xorm:"varchar(32) notnull default '' comment('应用ID')"`
	SecretId  string    `json:"secret_id"  xorm:"varchar(64) notnull default '' comment('密钥ID')"`
	SecretKey string    `json:"secret_key" xorm:"varchar(64) notnull default '' comment('密钥Key')"`
	Prefix    string    `json:"prefix"     xorm:"varchar(32) notnull default '' comment('签名')"`
	TextNo1   string    `json:"textno1"    xorm:"varchar(32) notnull default '' comment('验证码模板')"`
	SortNo    int       `json:"sortno"     xorm:"int unique comment('排序序号')"`
	NSent     int       `json:"nsent"      xorm:"int default 0 comment('发送量')"`
	Disabled  bool      `json:"disabled"   xorm:"boolean default false comment('是否停用')"`
}

func (SMS) TableName() string {
	return "sms"
}

// IP 定位
type GeoIP struct {
	AMapWebKey    string `json:"amap_webkey"    xorm:"varchar(128) default '' comment('高德开放平台 web 服务 key')"`
	AMapEnable    bool   `json:"amap_enable"    xorm:"boolean default false comment('是否允许高德开放平台')"`
	AMapApiVer    string `json:"amap_apiver"    xorm:"varchar(8) default 'v3' comment('高德开放平台 IP 定位接口版本')"`
	TencentWebKey string `json:"tencent_webkey" xorm:"varchar(128) default '' comment('腾讯位置服务 web 服务 key')"`
	TencentEnable bool   `json:"tencent_enable" xorm:"boolean default false comment('是否允许腾讯位置服务')"`
}

func (GeoIP) TableName() string {
	return "geoip"
}

// 层次结构
type Tree struct {
	UUID      string    `json:"uuid"       xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt  time.Time `json:"create_at"  xorm:"timestamp created notnull comment('创建时间')"`
	UpdateAt  time.Time `json:"update_at"  xorm:"timestamp updated notnull comment('更新时间')"`
	Name      string    `json:"name"       xorm:"varchar(64) notnull comment('名称')"`
	Summary   string    `json:"summary"    xorm:"varchar(256) notnull default '' comment('描述')"`
	Up        string    `json:"up"         xorm:"varchar(36) notnull default '' comment('上级')"`
	TPath     string    `json:"tpath"      xorm:"text tpath notnull comment('路径')"`
	TPathHash string    `json:"tpath_hash" xorm:"varchar(32) tpath_hash notnull comment('路径 md5 hash 值')"`
	NLevel    int       `json:"nlevel"     xorm:"int nlevel notnull comment('级别')"`
	Disabled  bool      `json:"disabled"   xorm:"boolean default false comment('禁用')"`
	SortNo    int       `json:"sortno"     xorm:"int sortno notnull comment('排序')"`
}

func (Tree) TableName() string {
	return "tree"
}

// 层次结构绑定
type TreeBind struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	Node     string    `json:"node"      xorm:"varchar(36) notnull comment('节点')"`
	Entity   string    `json:"entity"    xorm:"varchar(36) notnull comment('资源')"`
	Type     int       `json:"type"      xorm:"int notnull comment('类型')"`
}

func (TreeBind) TableName() string {
	return "tree_bind"
}

// 系统公告
type Bulletin struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UserUUID string    `json:"user_uuid" xorm:"varchar(36) notnull comment('用户UUID')"`
	Title    string    `json:"title"     xorm:"varchar(256) notnull comment('标题')"`
	Content  string    `json:"content"   xorm:"text notnull comment('内容')"`
	SendTime time.Time `json:"send_time" xorm:"timestamp notnull comment('发布时间')"`
	IsPublic bool      `json:"is_public" xorm:"boolean default false comment('公开访问')"`
	IsNotify bool      `json:"is_notify" xorm:"boolean default true comment('通知用户')"`
	Status   int       `json:"status"    xorm:"int notnull default 1 comment('状态')"` // 1.草稿 2.等待发布 3.发布成功 4.发布失败
	NRead    int       `json:"nread"     xorm:"int notnull default 0 comment('阅读次数')"`
	NStar    int       `json:"nstar"     xorm:"int notnull default 0 comment('点赞次数')"`
}

func (Bulletin) TableName() string {
	return "bulletins"
}

// 通知
type Notification struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UserUUID string    `json:"user_uuid" xorm:"varchar(36) notnull comment('用户UUID')"`
	Type     int       `json:"type"      xorm:"int notnull default 1 comment('类型')"` // 1.通知 2.公告
	Title    string    `json:"title"     xorm:"varchar(256) notnull comment('标题')"`
	Content  string    `json:"content"   xorm:"text notnull comment('内容')"`
	Status   int       `json:"status"    xorm:"int notnull default 1 comment('状态')"` // 1.未读 2.已读
	Refer    string    `json:"refer"     xorm:"varchar(36) comment('引用')"`
}

func (Notification) TableName() string {
	return "notifications"
}

// 操作记录
type Ops struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UserUUID string    `json:"user_uuid" xorm:"varchar(36) notnull comment('用户UUID')"`
	Method   string    `json:"method"    xorm:"varchar(16) notnull comment('方法')"`
	URL      string    `json:"url"       xorm:"varchar(256) notnull comment('URL')"`
	Body     string    `json:"body"      xorm:"text notnull comment('请求内容')"`
	Audit    string    `json:"audit"     xorm:"varchar(256) notnull comment('审计消息')"`
}

// 身份授权设置
type OAuth struct {
	Provider string `json:"provider" xorm:"varchar(32) notnull unique comment('身份提供方')"`
	SortNo   int    `json:"sortno"   xorm:"int notnull default 1 unique comment('排序序号')"`
	ClientId string `json:"clientid" xorm:"varchar(128) notnull default '' comment('客户端id')"`
	Secret   string `json:"secret"   xorm:"varchar(128) notnull default '' comment('客户端密钥')"`
	Enabled  bool   `json:"enabled"  xorm:"boolean default false comment('启用')"`
}

// 用户授权账号
type UserOAuth struct {
	UUID     string    `json:"uuid"      xorm:"varchar(36) pk notnull comment('UUID')"`
	CreateAt time.Time `json:"create_at" xorm:"timestamp created notnull comment('创建时间')"`
	UserUUID string    `json:"user_uuid" xorm:"varchar(36) notnull comment('用户UUID')"`
	Provider string    `json:"provider"  xorm:"varchar(32) notnull comment('身份提供方')"`
	UserId   string    `json:"userid"    xorm:"varchar(256) notnull default '' comment('用户编号')"`
	Email    string    `json:"email"     xorm:"varchar(128) notnull default '' comment('邮箱地址')"`
	Login    string    `json:"login"     xorm:"varchar(128) notnull default '' comment('登录名')"`
	Name     string    `json:"name"      xorm:"varchar(128) notnull default '' comment('用户名')"`
	Avatar   string    `json:"avatar"    xorm:"varchar(256) notnull default '' comment('头像')"`
	Profile  string    `json:"profile"   xorm:"text notnull default '' comment('用户信息')"`
	Status   int       `json:"status"    xorm:"int notnull default 1 comment('状态')"` // 1.未授权 2.已授权
	Usage    int       `json:"usage"     xorm:"int notnull default 1 comment('用途')"` // 1.授权 2.登录
}

func (UserOAuth) TableName() string {
	return "user_oauth"
}
