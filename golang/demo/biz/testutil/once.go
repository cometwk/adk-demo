package testutil

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const dir = "/tmp/testonce"

func DoOnce(key string, fn func() error) error {

	if key == "" {
		return errors.New("testonce: key must not be empty")
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("testonce: mkdir %s failed: %w", dir, err)
	}

	flagFile := filepath.Join(dir, key)

	f, err := os.OpenFile(
		flagFile,
		os.O_CREATE|os.O_EXCL|os.O_WRONLY,
		0644,
	)
	if err != nil {
		if errors.Is(err, fs.ErrExist) {
			// 已执行过
			return nil
		}
		return fmt.Errorf("testonce: create flag file failed: %w", err)
	}
	defer f.Close()

	// 👇 只有第一个进程能走到这里
	return fn()
}
