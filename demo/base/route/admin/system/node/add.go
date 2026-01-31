package node

import (
	"crypto/md5"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/pkg/errors"
)

// 添加子节点
func add(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		UUID    string `json:"uuid" validate:"required"`
		Sibling bool   `json:"sibling"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	var err error
	ql := `select * from tree where uuid = ?`
	var node db.Tree

	if err := db.SelectOneX(c, ql, &node, input.UUID); err != nil {
		cc.ErrLog(err).Error("查询层次结构错")
		return c.NoContent(http.StatusInternalServerError)
	}

	newid := uuid.NewString()
	if input.Sibling {
		err = addSibling(cc, node, newid)
	} else {
		err = addChild(cc, node, newid)
	}

	if err != nil {
		cc.ErrLog(err).Error("插入层次结构错")
		return c.NoContent(http.StatusInternalServerError)
	}

	return c.JSON(http.StatusOK, echo.Map{"uuid": newid})
}

func addChild(cc ctx.Context, node db.Tree, newid string) error {
	ql := `
		select coalesce(max(sortno),0) from tree where nlevel = ? and tpath like ?
	`
	var maxSortNo int

	err := db.SelectOneX(cc, ql, &maxSortNo, node.NLevel+1, node.TPath+"%")
	if err != nil {
		return errors.Wrapf(err, "查询层次结构错")
	}
	ql = `
		insert into tree (
			uuid, name, summary, up, tpath, tpath_hash, nlevel, sortno
		) values (
			?, ?, ?, ?, ?, ?, ?, ?
		)
	`
	tpath := node.TPath + "." + newid
	sum := md5.Sum([]byte(tpath))
	hash := hex.EncodeToString(sum[:])

	err = db.ExecOneX(cc, ql,
		newid, "新节点"+strconv.Itoa(maxSortNo+1), "新节点说明", node.UUID, tpath, hash, node.NLevel+1, maxSortNo+1,
	)
	if err != nil {
		return errors.Wrapf(err, "插入层次结构错")
	}
	return nil
}

func addSibling(cc ctx.Context, node db.Tree, newid string) error {
	tx := orm.MustSession(cc.Request().Context())
	defer tx.Close()
	tx.Begin()

	//  (node, end) 之间的兄弟节点, 全部序号 + 1
	ql := `update tree set sortno = sortno + 1 where up = ? and sortno > ?  and nlevel = ?`
	if _, err := tx.Exec(ql, node.Up, node.SortNo, node.NLevel); err != nil {
		return errors.Wrapf(err, "更新节点信息错")
	}

	ql = `
		insert into tree (
			uuid, name, summary, up, tpath, tpath_hash, nlevel, sortno
		) values (
			?, ?, ?, ?, ?, ?, ?, ?
		)
	`

	// 将 newNode 的序号 = node + 1
	arr := strings.Split(node.TPath, ".")
	if len(arr) < 2 {
		return errors.New("不能移动该节点")
	}
	tpath := strings.Join(arr[:len(arr)-1], ".") + "." + newid
	sum := md5.Sum([]byte(tpath))
	hash := hex.EncodeToString(sum[:])

	err := db.ExecOneTX(tx, ql,
		newid, "新节点"+strconv.Itoa(node.SortNo+1), "新节点说明",
		node.Up, tpath, hash, node.NLevel, node.SortNo+1,
	)
	if err != nil {
		return errors.Wrapf(err, "插入层次结构错")
	}

	tx.Commit()

	return nil
}
