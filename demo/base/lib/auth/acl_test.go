package auth

// import (
// 	"fmt"
// 	"net/http/httptest"
// 	"strings"
// 	"testing"

// 	"github.com/labstack/echo/v4"
// 	"github.com/cometwk/base/ctx"
// 	"github.com/cometwk/base/lib/db"
// 	"github.com/cometwk/lib/pkg/orm"
// )

// func TestCheckUrl(t *testing.T) {
// 	orm.InitDefaultDB()
// 	const wk = "e33c792f-3d9e-47c5-a973-f4ffc016a3dd"
// 	var cc ctx.Context
// 	{
// 		// 创建一个测试用的 echo 上下文
// 		e := echo.New()
// 		req := httptest.NewRequest("GET", "/", strings.NewReader(""))
// 		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
// 		rec := httptest.NewRecorder()
// 		c := e.NewContext(req, rec)
// 		cc = ctx.NewTestContext(c)
// 	}
// 	info, err := jwtCache.fetch(cc, wk)
// 	if err != nil {
// 		t.Fatal(err)
// 	}

// 	result := FilterByUserAcls("GET", "/table/p_key/search", info.allows)
// 	fmt.Println(result)
// }

// func BenchmarkFilterByUserAclsWithInfo(b *testing.B) {
// 	orm.InitDefaultDB()
// 	const wk = "e33c792f-3d9e-47c5-a973-f4ffc016a3dd"
// 	var cc ctx.Context
// 	{
// 		e := echo.New()
// 		req := httptest.NewRequest("GET", "/", strings.NewReader(""))
// 		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
// 		rec := httptest.NewRecorder()
// 		c := e.NewContext(req, rec)
// 		cc = ctx.NewTestContext(c)
// 	}

// 	// 重置计时器，确保初始化代码不计入时间
// 	b.ResetTimer()

// 	// BenchmarkFilterByUserAclsWithInfo-14    	 2685559	       427.7 ns/op	     928 B/op	       8 allocs/op
// 	// 2685559 次, 427.7 ns/op, 928 B/op, 8 allocs/op

// 	for i := 0; i < b.N; i++ {
// 		info, err := jwtCache.fetch(cc, wk)
// 		if err != nil {
// 			b.Fatal(err)
// 		}
// 		result := FilterByUserAcls("GET", "/table/p_key/search", info.allows)
// 		if result != true {
// 			b.Fatal("result is not true")
// 		}
// 	}
// }

// func testInit() map[int]*db.AclAllow {

// 	codeEntries := []CodeEntry{
// 		{Code: 6000, Title: "用户授权", Url: "/biz/user/*"},
// 		{Code: 6001, Title: "设备注册", Url: "/biz/device/*"},
// 		{Code: 9010, Title: "访问控制", Url: "/system/acl/*"},
// 	}
// 	resetUrlMatcher(codeEntries)

// 	// 创建测试用的 ACL 权限映射
// 	userAcls := map[int]*db.AclAllow{
// 		6000: {IRead: true, IWrite: false, IAdmin: false}, // 只读权限
// 		6001: {IRead: true, IWrite: true, IAdmin: false},  // 读写权限
// 		9010: {IRead: true, IWrite: true, IAdmin: true},   // 管理员权限
// 	}

// 	return userAcls
// }
// func TestFilterByUserAcls(t *testing.T) {

// 	userAcls := testInit()

// 	tests := []struct {
// 		name     string
// 		method   string
// 		url      string
// 		expected bool
// 	}{

// 		// 6000 权限
// 		{name: "用户授权 - GET", method: "GET", url: "/biz/user/search", expected: true},
// 		{name: "用户授权 - POST", method: "POST", url: "/biz/user/update/123", expected: false},

// 		// 6001 权限
// 		{name: "设备注册 - GET", method: "GET", url: "/biz/device/find/123", expected: true},
// 		{name: "设备注册 - GET", method: "GET", url: "/biz/device/search", expected: true},
// 		{name: "设备注册 - POST", method: "POST", url: "/biz/device/update-in/123", expected: true},

// 		// 9010 权限
// 		{name: "访问控制 - GET", method: "GET", url: "/system/acl/", expected: true},
// 		{name: "访问控制 - POST", method: "POST", url: "/system/acl/add", expected: true},
// 		{name: "访问控制 - POST", method: "POST", url: "/system/acl/allow/add", expected: true},
// 		{name: "访问控制 - GET", method: "DELETE", url: "/system/acl/allow/list", expected: true},

// 		// false
// 		{name: "访问控制 - GET", method: "GET", url: "/x/123", expected: false},
// 		{name: "访问控制 - GET", method: "GET", url: "/system/x", expected: false},
// 	}

// 	for _, tt := range tests {
// 		t.Run(tt.name, func(t *testing.T) {
// 			result := FilterByUserAcls(tt.method, tt.url, userAcls)
// 			if result != tt.expected {
// 				t.Errorf("FilterByUserAcls(%s, %s) = %v; want %v",
// 					tt.method, tt.url, result, tt.expected)
// 			}
// 		})
// 	}
// }

// // performance test
// func BenchmarkFilterByUserAcls(b *testing.B) {
// 	userAcls := testInit()
// 	for i := 0; i < b.N; i++ {
// 		FilterByUserAcls("GET", "/biz/user/search", userAcls)
// 	}
// }
