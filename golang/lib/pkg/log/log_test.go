package log

import (
	"context"
	"path"
	"runtime"
	"strconv"
	"testing"

	"github.com/fatih/color"
	"github.com/sirupsen/logrus"
)

func TestLogger_NilContext(t *testing.T) {
	logger := Logger(nil)
	if logger == nil {
		t.Fatal("Logger(nil) should return baseLogger, not nil")
	}
	// Check default fields exist
	if logger.Data["module"] != "default" {
		t.Errorf("expected module=default, got %v", logger.Data["module"])
	}
	if logger.Data["feature"] != "default" {
		t.Errorf("expected feature=default, got %v", logger.Data["feature"])
	}
}

func TestLogger_EmptyContext(t *testing.T) {
	ctx := context.Background()
	logger := Logger(ctx)
	if logger == nil {
		t.Fatal("Logger(context.Background()) should return baseLogger, not nil")
	}
	if logger.Data["module"] != "default" {
		t.Errorf("expected module=default, got %v", logger.Data["module"])
	}
}

func TestLogger_WithStoredLogger(t *testing.T) {
	ctx := context.Background()
	customLogger := logrus.WithField("custom", "value")
	ctx = WithLogger(ctx, customLogger)
	logger := Logger(ctx)
	if logger.Data["custom"] != "value" {
		t.Errorf("expected custom=value, got %v", logger.Data["custom"])
	}
}

func TestWithModule_NilContext(t *testing.T) {
	ctx := WithModule(nil, "test-module")
	logger := Logger(ctx)
	if logger.Data["module"] != "test-module" {
		t.Errorf("expected module=test-module, got %v", logger.Data["module"])
	}
	// Should still have default feature
	if logger.Data["feature"] != "default" {
		t.Errorf("expected feature=default, got %v", logger.Data["feature"])
	}
}

func TestWithModule_EmptyString(t *testing.T) {
	ctx := context.Background()
	ctx = WithModule(ctx, "")
	logger := Logger(ctx)
	if logger.Data["module"] != "default" {
		t.Errorf("empty module should fallback to 'default', got %v", logger.Data["module"])
	}
}

func TestWithFeature_EmptyString(t *testing.T) {
	ctx := context.Background()
	ctx = WithFeature(ctx, "")
	logger := Logger(ctx)
	if logger.Data["feature"] != "default" {
		t.Errorf("empty feature should fallback to 'default', got %v", logger.Data["feature"])
	}
}

func TestFieldOverride_LastWins(t *testing.T) {
	ctx := context.Background()
	ctx = WithModule(ctx, "first")
	ctx = WithModule(ctx, "second")
	logger := Logger(ctx)
	if logger.Data["module"] != "second" {
		t.Errorf("expected module=second (last wins), got %v", logger.Data["module"])
	}
}

func TestChain_WithModuleWithFeature(t *testing.T) {
	ctx := context.Background()
	ctx = WithModule(ctx, "payment")
	ctx = WithFeature(ctx, "refund")
	logger := Logger(ctx)
	if logger.Data["module"] != "payment" {
		t.Errorf("expected module=payment, got %v", logger.Data["module"])
	}
	if logger.Data["feature"] != "refund" {
		t.Errorf("expected feature=refund, got %v", logger.Data["feature"])
	}
}

func TestWithReqID(t *testing.T) {
	ctx := context.Background()
	ctx = WithReqID(ctx, "req-123")
	logger := Logger(ctx)
	if logger.Data["reqid"] != "req-123" {
		t.Errorf("expected reqid=req-123, got %v", logger.Data["reqid"])
	}
}

func TestGetReqID(t *testing.T) {
	ctx := context.Background()
	ctx = WithReqID(ctx, "req-456")
	reqID := GetReqID(ctx)
	if reqID != "req-456" {
		t.Errorf("expected req-456, got %s", reqID)
	}
}

func TestGetReqID_NilContext(t *testing.T) {
	reqID := GetReqID(nil)
	if reqID != "" {
		t.Errorf("GetReqID(nil) should return empty string, got %s", reqID)
	}
}

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
