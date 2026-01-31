package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cometwk/base/lib/migrategen"
)

func migrateGen(name, docsDir, migrationsDir string, ai bool, aiFile string) error {
	res, err := migrategen.Apply(migrategen.Options{
		Name:          name,
		DocsDir:       filepath.Clean(docsDir),
		MigrationsDir: filepath.Clean(migrationsDir),
	})
	if err != nil {
		return err
	}

	if !res.Changed {
		fmt.Println("无变更：当前 DDL 快照与基线 `serve/docs/table.sql` 完全一致，未生成 migration。")
		fmt.Printf("baseline_sha256=%s\n", res.OldSnapshotSHA)
		return nil
	}

	fmt.Println("已生成 migration：")
	fmt.Printf("- up:   %s\n", res.UpPath)
	fmt.Printf("- down: %s\n", res.DownPath)
	fmt.Println("已更新快照：")
	fmt.Printf("- serve/docs/table.sql (sha256: %s -> %s)\n", res.OldSnapshotSHA, res.NewSnapshotSHA)

	if ai {
		prompt := migrategen.BuildAIPrompt(res.Version, res.NameSanitized, res.TableChanges)
		outPath := aiFile
		if outPath == "" {
			outPath = filepath.Join(filepath.Clean(migrationsDir), fmt.Sprintf("%s_%s.ai.md", res.Version, res.NameSanitized))
		}
		if err := os.WriteFile(outPath, []byte(prompt), 0o644); err != nil {
			return fmt.Errorf("write ai prompt: %w", err)
		}
		fmt.Println("已生成 AI 改写提示词：")
		fmt.Printf("- %s\n", outPath)
	}
	return nil
}
