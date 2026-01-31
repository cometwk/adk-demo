package log

import (
	"path"
	"runtime"
	"strconv"
	"testing"

	"github.com/fatih/color"
	"github.com/sirupsen/logrus"
)

func TestLog1(t *testing.T) {
	color.NoColor = false
	logrus.SetReportCaller(true)
	logrus.SetFormatter(&logrus.JSONFormatter{
		CallerPrettyfier: func(f *runtime.Frame) (function string, file string) {
			function = path.Base(f.Function)
			file = path.Base(f.File) + ":" + strconv.Itoa(f.Line)
			return
		},
		FieldMap: logrus.FieldMap{
			logrus.FieldKeyMsg: "message",
		},
		// PrettyPrint: dev,
	})
	// nullFile, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	// if err != nil {
	// 	logrus.Fatalf("无法打开 /dev/null: %v", err)
	// }

	// logrus.SetOutput(nullFile)
	logrus.AddHook(NewTerminalHook())
	log2 := logrus.WithField("id", "123")
	log2.Info("Benchmark log with caller info")
	log2.WithField("error", "error").
		WithField("module", "ormx").
		WithField("reqid", "abc").
		WithField("id", "123").
		Error("Error log with caller info")
}

func TestLog2(t *testing.T) {
	logrus.Info("Benchmark log without caller info")
}

// BenchmarkLogrusWithCaller-14    	   45734	     29745 ns/op	     489 B/op	      15 allocs/op
// BenchmarkLogrusWithCaller-14    	   29048	     41890 ns/op	    1258 B/op	      22 allocs/op
func BenchmarkLogrusWithCaller(b *testing.B) {
	logrus.SetReportCaller(true)
	logrus.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
		// CallerPrettyfier: func(f *runtime.Frame) (function string, file string) {
		// 	return f.Function, f.File + "" + strconv.Itoa(f.Line)
		// },
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		logrus.Info("Benchmark log with caller info")
	}
}

// BenchmarkLogrusWithoutCaller-14    	   43274	     29731 ns/op	     521 B/op	      15 allocs/op
func BenchmarkLogrusWithoutCaller(b *testing.B) {
	logrus.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		logrus.Info("Benchmark log without caller info")
	}
}
