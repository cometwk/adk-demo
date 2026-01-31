package auth

import (
	"fmt"
	"regexp"
	"strings"
	"sync"

	"github.com/cometwk/base/lib/db"
	"github.com/sirupsen/logrus"
)

type CodeEntry struct {
	Code  int    `json:"code"`          // 代码
	Title string `json:"title"`         // 标题
	Url   string `json:"url,omitempty"` // 后端接口
}

type urlPattern struct {
	pattern *regexp.Regexp
	entries []*CodeEntry // 改为切片存储多个 entry
}

type urlMatcher struct {
	staticPaths map[string][]*CodeEntry // 精确匹配
	patterns    []urlPattern            // 通配符匹配
	cache       map[string][]*CodeEntry // URL匹配结果缓存
	cacheMutex  sync.RWMutex            // 添加读写锁
}

var matcher *urlMatcher

func ResetUrlMatcher(entries []CodeEntry) {
	codeEntries := defaultCodeEntries
	if len(entries) > 0 {
		codeEntries = append(codeEntries, entries...)
	}

	matcher = &urlMatcher{
		staticPaths: make(map[string][]*CodeEntry),
		patterns:    make([]urlPattern, 0),
		cache:       make(map[string][]*CodeEntry),
	}

	// 创建临时 map 用于收集相同 pattern 的 entries
	patternMap := make(map[string]*urlPattern)

	// 预处理所有路由模式
	for i := range codeEntries {
		entry := &codeEntries[i] // 使用指针避免复制
		if !strings.Contains(entry.Url, "*") && !strings.Contains(entry.Url, ":") {
			// 静态路径直接存储
			matcher.staticPaths[entry.Url] = append(matcher.staticPaths[entry.Url], entry)
		} else {
			// 编译通配符模式
			pattern := strings.ReplaceAll(entry.Url, "*", ".*")
			pattern = regexp.MustCompile(`:[^/]+`).ReplaceAllString(pattern, `[^/]+`)
			patternStr := "^" + pattern + "$"

			// 检查是否已存在相同的 pattern
			if p, exists := patternMap[patternStr]; exists {
				// 如果存在，直接添加到现有的 entries 中
				p.entries = append(p.entries, entry)
			} else {
				// 如果不存在，创建新的 urlPattern
				re := regexp.MustCompile(patternStr)
				newPattern := &urlPattern{
					pattern: re,
					entries: []*CodeEntry{entry},
				}
				patternMap[patternStr] = newPattern
			}
		}
	}

	// 将收集的 pattern 转换为切片
	for _, p := range patternMap {
		matcher.patterns = append(matcher.patterns, *p)
	}
}

func PrintUrlMatcher() {
	matcher.cacheMutex.RLock()
	defer matcher.cacheMutex.RUnlock()

	// print matcher
	entriesToStr := func(entries []*CodeEntry) string {
		var result strings.Builder
		result.WriteString("[")
		for i, entry := range entries {
			if i > 0 {
				result.WriteString(", ")
			}
			result.WriteString(fmt.Sprintf("(%d, %s)", entry.Code, entry.Title))
		}
		result.WriteString("]")
		return result.String()
	}
	fmt.Println("Static Paths:")
	for path, entries := range matcher.staticPaths {
		fmt.Printf("Static: %s, Entry: %+v\n", path, entriesToStr(entries))
	}
	fmt.Println("Patterns:")
	for _, pattern := range matcher.patterns {
		fmt.Printf("Pattern: %s, Entries: %+v\n", pattern.pattern.String(), entriesToStr(pattern.entries))
	}

}

func init() {
	ResetUrlMatcher(defaultCodeEntries)
	// PrintUrlMatcher()
}

// getCodeFromURL 匹配 URL 到多个 Code
func getCodeFromURL(url string) ([]*CodeEntry, bool) {
	// 1. 检查缓存 - 使用读锁
	matcher.cacheMutex.RLock()
	if entry, ok := matcher.cache[url]; ok {
		matcher.cacheMutex.RUnlock()
		return entry, true
	}
	matcher.cacheMutex.RUnlock()

	// 预估可能的最大匹配数
	matchedEntries := make([]*CodeEntry, 0, 4)

	// 2. 检查静态路径
	if codes, ok := matcher.staticPaths[url]; ok {
		matchedEntries = append(matchedEntries, codes...)
	}

	// 3. 检查通配符模式
	for _, p := range matcher.patterns {
		if p.pattern.MatchString(url) {
			matchedEntries = append(matchedEntries, p.entries...) // 添加所有匹配的 entries
		}
	}

	// 如果有匹配的结果，写入缓存 - 使用写锁
	if len(matchedEntries) > 0 {
		matcher.cacheMutex.Lock()
		matcher.cache[url] = matchedEntries
		matcher.cacheMutex.Unlock()
		return matchedEntries, true
	}

	return nil, false
}

func FilterByUserAcls(method, url string, userAcls map[int]*db.AclAllow) bool {
	// if env.MustBool("DEV") {
	// 	return true
	// }
	logrus.Infof("FilterByUserAcls: %s, %s", method, url)

	// entries 根据 url 获取多个 code
	entries, ok := getCodeFromURL(url)
	if !ok {
		return false
	}

	for _, entry := range entries {
		if entry.Code == 0 {
			// 0 表示 pass
			return true
		}

		acl, ok := userAcls[entry.Code]
		if !ok {
			continue
		}

		switch method {
		case "GET":
			if acl.IRead || acl.IWrite || acl.IAdmin {
				return true
			}
		case "POST":
			if acl.IWrite || acl.IAdmin {
				return true
			}
		default:
			if acl.IAdmin {
				return true
			}
		}
	}

	return false
}
