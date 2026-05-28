package logx

import (
	"context"
	"testing"

	"github.com/lucky-byte/lib/pkg/orm"
	"github.com/sirupsen/logrus"
)

func TestLoggerWith(t *testing.T) {
	// Setup: create a context with reqid
	ctx := orm.WithReqID(context.Background(), "test-req-123")

	// Create an xlog with module field (simulating package-level xlog)
	xlog := logrus.WithField("module", "test-module")

	logger := LoggerWith(ctx, xlog)

	// Verify the logger has both reqid and module fields
	if logger.Data["reqid"] != "test-req-123" {
		t.Errorf("expected reqid='test-req-123', got '%v'", logger.Data["reqid"])
	}
	if logger.Data["module"] != "test-module" {
		t.Errorf("expected module='test-module', got '%v'", logger.Data["module"])
	}
}

func TestLoggerWithChanField(t *testing.T) {
	ctx := orm.WithReqID(context.Background(), "test-req-456")

	// Create an xlog with chan field (simulating channel-level xlog)
	xlog := logrus.WithField("chan", "ccb")

	logger := LoggerWith(ctx, xlog)

	// Verify the logger has reqid and chan fields
	if logger.Data["reqid"] != "test-req-456" {
		t.Errorf("expected reqid='test-req-456', got '%v'", logger.Data["reqid"])
	}
	if logger.Data["chan"] != "ccb" {
		t.Errorf("expected chan='ccb', got '%v'", logger.Data["chan"])
	}
}

func TestLoggerWithMultipleFields(t *testing.T) {
	ctx := orm.WithReqID(context.Background(), "test-req-789")

	// Create an xlog with multiple fields (module + feature)
	xlog := logrus.WithFields(logrus.Fields{
		"module":  "stats",
		"feature": "daily",
	})

	logger := LoggerWith(ctx, xlog)

	// Verify all fields are present
	if logger.Data["reqid"] != "test-req-789" {
		t.Errorf("expected reqid='test-req-789', got '%v'", logger.Data["reqid"])
	}
	if logger.Data["module"] != "stats" {
		t.Errorf("expected module='stats', got '%v'", logger.Data["module"])
	}
	if logger.Data["feature"] != "daily" {
		t.Errorf("expected feature='daily', got '%v'", logger.Data["feature"])
	}
}

func TestLoggerWithNilContext(t *testing.T) {
	// Test with nil context
	xlog := logrus.WithField("module", "test-module")

	logger := LoggerWith(nil, xlog)

	// With nil context, reqid should not exist (no reqid field)
	if _, ok := logger.Data["reqid"]; ok {
		t.Errorf("expected reqid field to not exist when ctx is nil")
	}
	// xlog fields should still be present
	if logger.Data["module"] != "test-module" {
		t.Errorf("expected module='test-module', got '%v'", logger.Data["module"])
	}
}

func TestLoggerWithNilXlog(t *testing.T) {
	ctx := orm.WithReqID(context.Background(), "test-req-nil")

	logger := LoggerWith(ctx, nil)

	// Should return logger with just reqid
	if logger.Data["reqid"] != "test-req-nil" {
		t.Errorf("expected reqid='test-req-nil', got '%v'", logger.Data["reqid"])
	}
}

func TestLogger(t *testing.T) {
	ctx := orm.WithReqID(context.Background(), "standalone-req")

	logger := Logger(ctx)

	// Verify it only has reqid
	if logger.Data["reqid"] != "standalone-req" {
		t.Errorf("expected reqid='standalone-req', got '%v'", logger.Data["reqid"])
	}
	// Should not have other fields
	if len(logger.Data) != 1 {
		t.Errorf("expected 1 field, got %d fields: %v", len(logger.Data), logger.Data)
	}
}