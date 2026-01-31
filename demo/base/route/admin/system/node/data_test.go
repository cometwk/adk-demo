package node

import (
	"testing"

	"github.com/cometwk/lib/pkg/orm"
)

func TestData(t *testing.T) {
	orm.InitDefaultDB()

	sql0 := `delete from tree`
	sql := `
	INSERT INTO tree (uuid,create_at,update_at,name,summary,up,tpath,tpath_hash,nlevel,disabled,sortno) VALUES
	 ('6e0c44c6-08ef-48d8-b48e-69c9903cc3f1','2025-01-01 03:33:55','2025-01-01 03:33:55','根','根节点','','0','cfcd208495d565ef66e7dff9f98764da',1,0,1),
	 ('2fb833bc-904e-4c74-8b3f-1c530cd67c4e','2025-02-22 08:27:45','2025-02-23 06:41:25','北京','新节点说明','6e0c44c6-08ef-48d8-b48e-69c9903cc3f1','0.2fb833bc-904e-4c74-8b3f-1c530cd67c4e','4f91c1299b2991123fb4db0bab7dc03b',2,0,1),
	 ('7e7fe66a-adb9-45ec-9886-1872a549abe4','2025-02-22 08:27:47','2025-02-23 06:41:50','故宫','新节点说明','2fb833bc-904e-4c74-8b3f-1c530cd67c4e','0.2fb833bc-904e-4c74-8b3f-1c530cd67c4e.7e7fe66a-adb9-45ec-9886-1872a549abe4','22fe14ba01b4a8b4743f140b110d1b6d',3,0,2),
	 ('1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021','2025-02-22 08:27:50','2025-02-23 06:41:33','成都','新节点说明','6e0c44c6-08ef-48d8-b48e-69c9903cc3f1','0.1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021','e11b3bcd72c31176048b36219c81fd8c',2,0,2),
	 ('424fe1dc-2cae-4733-998e-b05d9d4fc249','2025-02-24 05:07:22','2025-02-24 05:07:40','金牛区','新节点说明','1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021','0.1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021.424fe1dc-2cae-4733-998e-b05d9d4fc249','93135327ca6911b9ad4132236bf6efd8',3,0,2),
	 ('ba549b07-fe97-46f5-a2e0-fb364dcf01ec','2025-02-24 05:07:46','2025-02-24 05:08:04','武侯区','新节点说明','1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021','0.1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021.ba549b07-fe97-46f5-a2e0-fb364dcf01ec','086fbd00659e831cdf27a5ab42ef0cc4',3,0,3),
	 ('27f6554d-3e91-4df2-a7e0-0fd156902c0d','2025-02-24 05:19:40','2025-02-24 05:19:50','成华区','新节点说明','1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021','0.1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021.27f6554d-3e91-4df2-a7e0-0fd156902c0d','03792a1a4d1bb88fc64e2a6f20bd3926',3,0,4),
	 ('795a8180-ac3e-42c7-9a6c-b7eb077dbf45','2025-02-24 08:13:57','2025-02-24 08:14:18','锦江区','新节点说明','1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021','0.1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021.795a8180-ac3e-42c7-9a6c-b7eb077dbf45','1d5ab2cf34617db5aa0d2ca02235216f',3,0,1),
	 ('c83e6b25-f06a-4d46-8bbd-1514c0a3a8a9','2025-02-24 08:14:25','2025-02-24 08:14:38','青羊区','新节点说明','1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021','0.1af5bd3b-15b8-4b5d-8b2a-7c7c18c97021.c83e6b25-f06a-4d46-8bbd-1514c0a3a8a9','315a83e86195e7bb5d259a4b3bd287b3',3,0,5),
	 ('8c571eaf-3c1a-4872-9ecf-f1162797c3d7','2025-02-24 08:34:27','2025-02-24 08:34:38','天坛','新节点说明','2fb833bc-904e-4c74-8b3f-1c530cd67c4e','0.2fb833bc-904e-4c74-8b3f-1c530cd67c4e.8c571eaf-3c1a-4872-9ecf-f1162797c3d7','727013a83ae15e889ef35950204e0fc2',3,0,1);
	 `

	tx := orm.MustSession(nil)
	tx.Close()
	tx.Begin()

	_, err := tx.Exec(sql0)
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(sql)
	if err != nil {
		t.Fatal(err)
	}
	tx.Commit()
}
