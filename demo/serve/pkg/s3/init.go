package s3

import (
	"github.com/cometwk/lib/pkg/env"
)

var defaultFS *LocalFS

func Init() error {
	root := env.DirPath("S3_DIR", "./s3")
	fs, err := NewLocalFS(root)
	if err != nil {
		return err
	}
	defaultFS = fs
	return nil
}

func MustS3() *LocalFS {
	if defaultFS == nil {
		panic("s3 not initialized")
	}
	return defaultFS
}
