package hz

// import (
// 	"strings"

// 	"github.com/mozillazg/go-pinyin"
// )

// var args = newPinYin()

// func init() {
// }

// func newPinYin() pinyin.Args {
// 	a := pinyin.NewArgs()
// 	a.Style = pinyin.FirstLetter
// 	a.Fallback = func(r rune, a pinyin.Args) []string {
// 		return []string{string(r)}
// 	}
// 	return a
// }

// // ParsePinYin  为了搜索, 转换拼音首字母。 例如:
// //
// //	`A中国人Bc` => `AZGRBC`
// func HzFirstLetter(str string) string {
// 	r := pinyin.Pinyin(str, args)

// 	var sb strings.Builder
// 	for _, row := range r {
// 		for _, cell := range row {
// 			sb.WriteString(cell)
// 		}
// 	}
// 	return sb.String()
// }

// //
// //func ParsePinYin(s string) string {
// //	r := pinyin.Pinyin(s, args)
// //	var sb strings.Builder
// //	for _, a := range r {
// //		for _, c := range a {
// //			sb.WriteString(strings.ToUpper(c))
// //		}
// //	}
// //	return sb.String()
// //}
