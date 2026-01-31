package s3

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/cometwk/lib/pkg/serve"
	"github.com/cometwk/lib/pkg/testutil"
	biztestutil "github.com/cometwk/serve/biz/testutil"
	"github.com/labstack/echo/v4"
)

func TestHandlers_RouteLevel(t *testing.T) {
	biztestutil.ResetTestOnce()
	root := "/tmp/test-s3-local-fs"
	t.Logf("root=%s", root)
	os.RemoveAll(root)

	fs, err := NewLocalFS(root)
	if err != nil {
		t.Fatalf("NewLocalFS err=%v", err)
	}

	e := serve.EchoTestSetup()
	e.POST("/files", fs.UploadHandler())
	e.GET("/files/:file_id", fs.DownloadHandler())
	e.GET("/files/:file_id/preview", fs.PreviewHandler())

	// 1) upload
	payload := []byte("0123456789abcdef")
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("file", "a.txt")
	if err != nil {
		t.Fatalf("CreateFormFile err=%v", err)
	}
	if _, err := fw.Write(payload); err != nil {
		t.Fatalf("write file err=%v", err)
	}
	_ = mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/files", &body)
	req.Header.Set(echo.HeaderContentType, mw.FormDataContentType())
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload status=%d body=%s", rec.Code, rec.Body.String())
	}
	var uploadResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &uploadResp); err != nil {
		t.Fatalf("unmarshal upload resp err=%v body=%s", err, rec.Body.String())
	}
	fileID, _ := uploadResp["file_id"].(string)
	if fileID == "" {
		t.Fatalf("missing file_id resp=%v", uploadResp)
	}

	// 2) download full
	r1 := testutil.NewRequest(e, http.MethodGet, "/files/"+fileID, nil)
	if r1.Code != http.StatusOK {
		t.Fatalf("download status=%d body=%s", r1.Code, r1.Body.String())
	}
	if got := r1.Header().Get(echo.HeaderContentDisposition); got == "" {
		t.Fatalf("missing content-disposition")
	}
	if !bytes.Equal(r1.Body.Bytes(), payload) {
		t.Fatalf("download body mismatch got=%q want=%q", r1.Body.Bytes(), payload)
	}

	// 3) preview range
	r2 := testutil.NewRequestWithHeader(e, http.MethodGet, "/files/"+fileID+"/preview", nil, http.Header{
		"Range": {"bytes=0-3"},
	})
	if r2.Code != http.StatusPartialContent {
		t.Fatalf("preview status=%d body=%s", r2.Code, r2.Body.String())
	}
	if got := r2.Header().Get("Content-Range"); got == "" {
		t.Fatalf("missing content-range")
	}
	if want := []byte("0123"); !bytes.Equal(r2.Body.Bytes(), want) {
		t.Fatalf("range body mismatch got=%q want=%q", r2.Body.Bytes(), want)
	}

	// 4) invalid range -> 416
	r3 := testutil.NewRequestWithHeader(e, http.MethodGet, "/files/"+fileID+"/preview", nil, http.Header{
		"Range": {"bytes=999999-"},
	})
	if r3.Code != http.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("invalid range status=%d body=%s", r3.Code, r3.Body.String())
	}
	if got := r3.Header().Get("Content-Range"); got == "" {
		t.Fatalf("missing content-range on 416")
	}

	// 5) sanity: uploaded file should exist under root
	var storage struct {
		StoragePath string `json:"storage_path"`
	}
	// storage_path 不在上传返回里，这里只做 filesystem sanity：root 不应为空/不存在
	if _, err := os.Stat(fs.RootDir); err != nil {
		t.Fatalf("root dir missing err=%v", err)
	}
	// ensure .tmp exists (created by upload)
	if _, err := os.Stat(filepath.Join(fs.RootDir, ".tmp")); err != nil {
		t.Fatalf("tmp dir missing err=%v", err)
	}
	_ = storage
}
