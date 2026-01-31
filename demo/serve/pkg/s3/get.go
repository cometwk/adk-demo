package s3

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/serve/biz"
	"github.com/labstack/echo/v4"
)

const (
	contentDispositionAttachment = "attachment"
	contentDispositionInline     = "inline"
)

func (s *LocalFS) GetFileBlob(ctx context.Context, fileID string) (*biz.FileBlob, error) {
	sess := orm.MustSession(ctx)
	defer sess.Close()

	var b biz.FileBlob
	ok, err := sess.Table(b.TableName()).Where("id = ?", fileID).Get(&b)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("file not found")
	}

	return &b, nil
}

func (s *LocalFS) getByFileID(c echo.Context, dispositionType string) error {
	ctx := c.Request().Context()
	fileID := c.Param("file_id")
	if fileID == "" {
		return echo.NewHTTPError(400, "missing file_id")
	}

	// sess := orm.MustSession(ctx)
	// defer sess.Close()

	// var b biz.FileBlob
	// ok, err := sess.Table(b.TableName()).Where("id = ?", fileID).Get(&b)
	// if err != nil {
	// 	return echo.NewHTTPError(500, "db error")
	// }
	// if !ok {
	// 	return echo.NewHTTPError(404, "file not found")
	// }

	b, err := s.GetFileBlob(ctx, fileID)
	if err != nil {
		return echo.NewHTTPError(500, "get file blob failed")
	}

	fp, err := os.Open(b.StoragePath)
	if err != nil {
		return echo.NewHTTPError(404, "content not found")
	}
	defer fp.Close()

	st, err := fp.Stat()
	if err != nil {
		return echo.NewHTTPError(500, "stat failed")
	}
	size := st.Size()

	res := c.Response()
	req := c.Request()

	res.Header().Set("Accept-Ranges", "bytes")
	if b.MimeType != "" {
		res.Header().Set(echo.HeaderContentType, b.MimeType)
	}
	res.Header().Set(
		echo.HeaderContentDisposition,
		buildContentDisposition(dispositionType, b.Filename),
	)

	rangeHeader := req.Header.Get("Range")
	if rangeHeader == "" {
		res.Header().Set(echo.HeaderContentLength, strconv.FormatInt(size, 10))
		return c.Stream(http.StatusOK, b.MimeType, fp)
	}

	start, end, perr := parseRange(rangeHeader, size)
	if perr != nil {
		res.Header().Set("Content-Range", "bytes */"+strconv.FormatInt(size, 10))
		return c.NoContent(http.StatusRequestedRangeNotSatisfiable)
	}

	if _, err := fp.Seek(start, 0); err != nil {
		return echo.NewHTTPError(500, "seek failed")
	}
	length := end - start + 1

	res.Header().Set("Content-Range", "bytes "+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10)+"/"+strconv.FormatInt(size, 10))
	res.Header().Set(echo.HeaderContentLength, strconv.FormatInt(length, 10))
	return c.Stream(http.StatusPartialContent, b.MimeType, ioLimitReader(fp, length))
}
