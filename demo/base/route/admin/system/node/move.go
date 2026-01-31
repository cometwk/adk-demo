package node

import (
	"crypto/md5"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
	"github.com/pkg/errors"
	"xorm.io/xorm"
)

// 判断 source 是否为 destination 的父级
func isParent(source db.Tree, destination db.Tree) bool {
	return strings.HasPrefix(destination.TPath, source.TPath)
}

// 移动节点规则：
// a = source, b = destination
// 1. 若 a b 在同一层级，
//   - 若 b 是 leaf or folder is closed，则 a 到 b 的位置 -1
//   - 若 b 是 folder is open，则 a 移动到 b 的子节点
//
// 2. 若 a b 不在同一层级:
//   - 若 a 是 b 的父级，禁止
//   - 其他规则同上
func move(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		Source      string `json:"source" validate:"required"`
		Destination string `json:"destination" validate:"required"`
		Type        string `json:"type" validate:"required,oneof=sibling child"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	var source, destination db.Tree
	ok, err := session.Where("uuid = ?", input.Source).Get(&source)
	if err != nil || !ok {
		return c.String(http.StatusInternalServerError, "查询源节点信息错")
	}
	ok, err = session.Where("uuid = ?", input.Destination).Get(&destination)
	if err != nil || !ok {
		return c.String(http.StatusInternalServerError, "查询目标节点信息错")
	}

	if isParent(source, destination) {
		return c.String(http.StatusBadRequest, "禁止父节点移动到子节点")
	}

	tx := orm.MustSession(c.Request().Context())
	defer tx.Close()

	tx.Begin()

	if input.Type == "child" {
		if err := moveToParent(tx, source, destination, true); err != nil {
			cc.ErrLog(err).Error("移动到子节点错")
			return err
		}
	} else {
		if source.Up == destination.Up {
			if err := sibling(tx, source, destination); err != nil {
				cc.ErrLog(err).Error("移动到兄弟节点错")
				return err
			}
		} else {
			var parentNode db.Tree
			ok, err := session.Where("uuid = ?", destination.Up).Get(&parentNode)
			if err != nil || !ok {
				return c.String(http.StatusInternalServerError, "查询目标的父节点信息错")
			}
			if err := moveToParent(tx, source, parentNode, true); err != nil {
				cc.ErrLog(err).Error("先移动到目标的父节点错")
				return err
			}
			{
				// refetch source and destination
				var source, destination db.Tree
				ok, err = tx.Where("uuid = ?", input.Source).Get(&source)
				if err != nil || !ok {
					return c.String(http.StatusInternalServerError, "查询源节点信息错")
				}
				ok, err = tx.Where("uuid = ?", input.Destination).Get(&destination)
				if err != nil || !ok {
					return c.String(http.StatusInternalServerError, "查询目标节点信息错")
				}
				if err := sibling(tx, source, destination); err != nil {
					cc.ErrLog(err).Error("再移动到兄弟节点错")
					return err
				}
			}
		}
	}

	tx.Commit()
	return nil
}
func moveToParent(tx *xorm.Session, node, parentNode db.Tree, first bool) error {
	if strings.HasPrefix(parentNode.TPath, node.TPath) {
		return errors.New("不能设置子节点作为新的父节点")
	}
	if parentNode.TPath+"."+node.UUID == node.TPath {
		return errors.New("新父节点与原父节点相同")
	}

	// 从原父节点离开，调整原来兄弟节点的序号: (node, +∞) 之间的兄弟节点, 全部序号 - 1
	ql := `update tree set sortno = sortno - 1 where up = ? and sortno > ? and nlevel = ?`
	if _, err := tx.Exec(ql, node.Up, node.SortNo, node.NLevel); err != nil {
		return errors.Wrapf(err, "更新节点信息错")
	}

	// 更新当前节点及所有子节点的 tpath 和 nlevel
	ql = `select * from tree where tpath like ?`
	var nodes []db.Tree
	if err := tx.SQL(ql, node.TPath+"%").Find(&nodes); err != nil {
		return errors.Wrapf(err, "查询层级节点错")
	}
	newPath := strings.Split(parentNode.TPath, ".")
	newPath = append(newPath, node.UUID)
	newPrefix := strings.Join(newPath, ".")

	for _, n := range nodes {
		p := strings.Replace(n.TPath, node.TPath, newPrefix, 1)
		l := len(strings.Split(p, "."))

		sum := md5.Sum([]byte(p))
		hash := hex.EncodeToString(sum[:])

		ql = `update tree set tpath = ?, tpath_hash = ?, nlevel = ? where uuid = ?`

		_, err := tx.Exec(ql, p, hash, l, n.UUID)
		if err != nil {
			return errors.Wrapf(err, "更新层级节点错")
		}
	}

	if first {
		return moveToParentFirst(tx, node, parentNode)
	}
	return moveToParentTail(tx, node, parentNode)

}

// 父节点 append 到父节点的开头
func moveToParentTail(tx *xorm.Session, node, parentNode db.Tree) error {
	var ql string
	driver := tx.Engine().DriverName()

	// 更新当前节点的父节点, 放在父节点的末尾
	if driver == "mysql" {
		ql = `
			update tree set up = ?, sortno = (
				select maxno from (
					select coalesce(max(sortno), 0) + 1 as maxno from tree where up = ?
				) as c
			) where uuid = ?
		`
	} else {
		ql = `
			update tree set up = ?, sortno = (
				select coalesce(max(sortno), 0) + 1 from tree where up = ?
			) where uuid = ?
		`
	}
	_, err := tx.Exec(ql, parentNode.UUID, parentNode.UUID, node.UUID)
	if err != nil {
		return errors.Wrapf(err, "更新层级节点错")
	}

	return nil
}

// 父节点 append 到父节点的开头
func moveToParentFirst(tx *xorm.Session, node, parentNode db.Tree) error {
	var ql string

	// 更新当前节点的父节点, 放在父节点的开头
	ql = `
		update tree set up = ?, sortno = 0 where uuid = ?
	`
	_, err := tx.Exec(ql, parentNode.UUID, node.UUID)
	if err != nil {
		return errors.Wrapf(err, "更新层级节点错")
	}

	// 新的兄弟节点序号 + 1
	ql = `update tree set sortno = sortno + 1 where up = ?`
	_, err = tx.Exec(ql, parentNode.UUID)
	if err != nil {
		return errors.Wrapf(err, "更新层级节点错")
	}

	return nil
}

// 兄弟节点
func sibling(tx *xorm.Session, sourceNode, destinationNode db.Tree) error {
	if destinationNode.Up != sourceNode.Up {
		return errors.New("要求为兄弟节点")
	}

	// 将 source 放在 destination 的前面
	up := destinationNode.Up
	nlevel := destinationNode.NLevel
	var sortno int
	if destinationNode.SortNo > sourceNode.SortNo {
		// 向下移动: (source, destination) 之间的兄弟节点, 全部序号 - 1
		ql := `update tree set sortno = sortno - 1 where up = ? and sortno > ? and sortno < ? and nlevel = ?`
		if _, err := tx.Exec(ql, up, sourceNode.SortNo, destinationNode.SortNo, nlevel); err != nil {
			return errors.Wrapf(err, "更新节点信息错")
		}
		sortno = destinationNode.SortNo - 1
	} else {
		// 向上移动: [destination, source) 之间的兄弟节点, 全部序号 + 1
		ql := `update tree set sortno = sortno + 1 where up = ? and sortno >= ? and sortno < ? and nlevel = ?`
		if _, err := tx.Exec(ql, up, destinationNode.SortNo, sourceNode.SortNo, nlevel); err != nil {
			return errors.Wrapf(err, "更新节点信息错")
		}
		sortno = destinationNode.SortNo
	}

	// 将 source 的序号设置为 destination 的序号
	ql := `update tree set sortno = ? where uuid = ?`
	if _, err := tx.Exec(ql, sortno, sourceNode.UUID); err != nil {
		return errors.Wrapf(err, "更新节点信息错")
	}

	return nil
}
