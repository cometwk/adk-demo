package s3

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/snowflake"
	"github.com/cometwk/serve/biz"
	"github.com/go-sql-driver/mysql"
	"github.com/labstack/echo/v4"
)

// LocalFS implements a content-addressed blob store on local filesystem,
// backed by table: file_blobs (hash-unique, id exposed to clients).
type LocalFS struct {
	RootDir string
}

func NewLocalFS(rootDir string) (*LocalFS, error) {
	if strings.TrimSpace(rootDir) == "" {
		return nil, fmt.Errorf("rootDir is required")
	}
	abs, err := filepath.Abs(rootDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, err
	}
	return &LocalFS{RootDir: abs}, nil
}

func (s *LocalFS) UploadHandler() echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		fh, err := c.FormFile("file")
		if err != nil {
			return echo.NewHTTPError(400, "missing file")
		}
		src, err := fh.Open()
		if err != nil {
			return echo.NewHTTPError(500, "open upload failed")
		}
		defer src.Close()

		mimeType := fh.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}

		fileID, size, err := s.Upload(ctx, src, fh.Filename, mimeType)
		if err != nil {
			return err
		}
		return c.JSON(200, struct {
			FileID int64 `json:"file_id,string"`
			Size   int64 `json:"size"`
		}{
			FileID: fileID,
			Size:   size,
		})
	}
}

func (s *LocalFS) DownloadHandler() echo.HandlerFunc {
	return func(c echo.Context) error {
		return s.getByFileID(c, contentDispositionAttachment)
	}
}

func (s *LocalFS) PreviewHandler() echo.HandlerFunc {
	return func(c echo.Context) error {
		return s.getByFileID(c, contentDispositionInline)
	}
}

func (s *LocalFS) Upload(ctx context.Context, src multipart.File, filename, mimeType string) (fileID int64, size int64, err error) {
	return s.UploadWithHash(ctx, src, filename, mimeType, "")
}

func (s *LocalFS) UploadWithHash(ctx context.Context, src multipart.File, filename, mimeType, hashCheck string) (fileID int64, size int64, err error) {
	// normalize & validate provided hash (optional)
	if strings.TrimSpace(hashCheck) != "" {
		hashCheck = strings.ToLower(strings.TrimSpace(hashCheck))
		if len(hashCheck) != 64 {
			return 0, 0, echo.NewHTTPError(400, "invalid content hash")
		}
		for _, c := range hashCheck {
			if (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') {
				continue
			}
			return 0, 0, echo.NewHTTPError(400, "invalid content hash")
		}
	}

	// 1) stream to temp file and compute SHA-256
	tmpDir := filepath.Join(s.RootDir, ".tmp")
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return 0, 0, echo.NewHTTPError(500, "create temp dir failed")
	}
	tmpFile, err := os.CreateTemp(tmpDir, "upload-*")
	if err != nil {
		return 0, 0, echo.NewHTTPError(500, "create temp file failed")
	}
	tmpName := tmpFile.Name()
	defer func() { _ = os.Remove(tmpName) }()
	defer tmpFile.Close()

	hasher := sha256.New()
	w := io.MultiWriter(tmpFile, hasher)
	n, err := io.CopyBuffer(w, src, make([]byte, 32*1024))
	if err != nil {
		return 0, 0, echo.NewHTTPError(500, "save upload failed")
	}
	hash := hex.EncodeToString(hasher.Sum(nil))
	size = n

	if hashCheck != "" && hashCheck != hash {
		return 0, 0, echo.NewHTTPError(400, "content hash mismatch")
	}

	finalPath, err := s.blobPath(hash)
	if err != nil {
		return 0, 0, echo.NewHTTPError(400, "invalid content hash")
	}
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o755); err != nil {
		return 0, 0, echo.NewHTTPError(500, "mkdir failed")
	}

	// 2) move file to final path (atomic rename); never overwrite an existing blob
	if _, statErr := os.Stat(finalPath); errors.Is(statErr, os.ErrNotExist) {
		if err := os.Rename(tmpName, finalPath); err != nil {
			return 0, 0, echo.NewHTTPError(500, "move file failed")
		}
	}

	// 3) DB: upsert blob by hash (unique constraint)
	sess := orm.MustSession(ctx)
	defer sess.Close()

	// NOTE: Do NOT wrap blob insert+lookup in a long-lived transaction.
	// Under MySQL default REPEATABLE READ, a transaction may not see rows
	// committed after it began, which can break concurrent dedup recovery.
	var blob biz.FileBlob
	blobTable := blob.TableName()

	exists, err := sess.Table(blobTable).Where("hash = ?", hash).Get(&blob)
	if err != nil {
		return 0, 0, echo.NewHTTPError(500, "db error")
	}
	if !exists {
		ins := biz.FileBlob{
			ID:          snowflake.SnowflakeId(),
			Hash:        hash,
			Filename:    filename,
			Size:        size,
			MimeType:    mimeType,
			StoragePath: finalPath,
			RefCount:    1,
		}
		if _, err := sess.Table(blobTable).Insert(&ins); err != nil {
			// concurrent dedup: rely on UNIQUE(hash) and reuse existing blob
			var me *mysql.MySQLError
			if !errors.As(err, &me) || me.Number != 1062 {
				return 0, 0, echo.NewHTTPError(500, "insert blob failed")
			}
		}
		// re-query to get the committed row (and its id)
		exists, err := sess.Table(blobTable).Where("hash = ?", hash).Get(&blob)
		if err != nil || !exists {
			return 0, 0, echo.NewHTTPError(500, "db dedup failed")
		}
	}

	fileID = blob.ID
	return fileID, size, nil
}

func (s *LocalFS) blobPath(hash string) (string, error) {
	if len(hash) != 64 {
		return "", fmt.Errorf("invalid hash length")
	}
	// ensure hex
	for _, c := range hash {
		if (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') {
			continue
		}
		return "", fmt.Errorf("invalid hash char")
	}
	dir1 := hash[0:2]
	dir2 := hash[2:4]
	return filepath.Join(s.RootDir, dir1, dir2, hash), nil
}
