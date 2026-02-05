package s3

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	biztestutil "github.com/cometwk/serve/biz/testutil"
)

func TestLocalFS_ConcurrentDedupOptional(t *testing.T) {
	db := biztestutil.ResetTestDB()
	defer db.Close()

	root := t.TempDir()
	fs, err := NewLocalFS(root)
	if err != nil {
		t.Fatalf("NewLocalFS err=%v", err)
	}

	content := []byte("hello-world-duplicate-content")
	wg := sync.WaitGroup{}

	const n = 5
	ids := make([]int64, n)
	errs := make([]error, n)

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()

			tmp, err := os.CreateTemp(t.TempDir(), "src-*")
			if err != nil {
				errs[i] = err
				return
			}
			tmpPath := tmp.Name()
			defer os.Remove(tmpPath)
			if _, err := tmp.Write(content); err != nil {
				_ = tmp.Close()
				errs[i] = err
				return
			}
			if _, err := tmp.Seek(0, 0); err != nil {
				_ = tmp.Close()
				errs[i] = err
				return
			}
			defer tmp.Close()

			id, _, err := fs.Upload(t.Context(), tmp, "a.txt", "text/plain")
			ids[i] = id
			errs[i] = err
		}(i)
	}
	wg.Wait()

	for i := 0; i < n; i++ {
		if errs[i] != nil {
			t.Fatalf("upload[%d] err=%v", i, errs[i])
		}
		if ids[i] == 0 {
			t.Fatalf("upload[%d] id=0", i)
		}
	}
	for i := 1; i < n; i++ {
		if ids[i] != ids[0] {
			t.Fatalf("upload[%d] id=%d want=%d", i, ids[i], ids[0])
		}
	}

	// DB 侧：应该只有 1 个 blob（hash 唯一去重）
	type row struct {
		Cnt int64 `xorm:"cnt"`
	}
	var blobs row
	_, _ = db.SQL("SELECT COUNT(*) AS cnt FROM file_blobs").Get(&blobs)
	if blobs.Cnt != 1 {
		t.Fatalf("blob cnt=%d want=1", blobs.Cnt)
	}

	// FS 侧：最终只应该有一个内容文件存在（按 hash 路径分桶）
	// 用查库拿 hash + storage_path 校验存在与路径规则
	var storage struct {
		Hash        string `xorm:"hash"`
		StoragePath string `xorm:"storage_path"`
	}
	_, _ = db.SQL("SELECT hash, storage_path FROM file_blobs LIMIT 1").Get(&storage)
	if storage.Hash == "" {
		t.Fatalf("empty hash")
	}
	if storage.StoragePath == "" {
		t.Fatalf("empty storage_path")
	}
	if _, err := os.Stat(storage.StoragePath); err != nil {
		t.Fatalf("stat storage_path err=%v path=%s", err, storage.StoragePath)
	}
	// sanity: storage_path 应该在 root 下
	rel, _ := filepath.Rel(root, storage.StoragePath)
	if rel == storage.StoragePath || rel == ".." || rel == "." {
		// not fatal, but helps catch unexpected path
		t.Fatalf("storage_path not under root: root=%s path=%s", root, storage.StoragePath)
	}
	// 规则：/<root>/<hash[0:2]>/<hash[2:4]>/<hash>
	if len(storage.Hash) != 64 {
		t.Fatalf("invalid hash len=%d", len(storage.Hash))
	}
	wantPath := filepath.Join(root, storage.Hash[0:2], storage.Hash[2:4], storage.Hash)
	if filepath.Clean(storage.StoragePath) != filepath.Clean(wantPath) {
		t.Fatalf("storage_path=%s want=%s", storage.StoragePath, wantPath)
	}
}
