package cmd

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/urfave/cli/v2"
)

// func printHelp() {
// 	fmt.Println("期望 'start', 'stop', 'status', 'version', 'adduser', 'migrate' 子命令")
// }

func Main() {
	cmdline := &cli.App{
		Usage: "reactgo serve",
		Commands: []*cli.Command{
			// {
			// 	Name:  "start",
			// 	Usage: "start backend web server",
			// 	Action: func(ctx *cli.Context) error {
			// 		fmt.Println("start backend web server")
			// 		// app.StartServer(options)
			// 		return nil
			// 	},
			// },
			// {
			// 	Name:  "stop",
			// 	Usage: "stop backend web server",
			// 	Action: func(ctx *cli.Context) error {
			// 		fmt.Println("stop backend web server")
			// 		handleStop()
			// 		return nil
			// 	},
			// },
			// {
			// 	Name:  "status",
			// 	Usage: "show backend web server status",
			// 	Action: func(ctx *cli.Context) error {
			// 		fmt.Println("show backend web server status")
			// 		handleStatus()
			// 		return nil
			// 	},
			// },
			// {
			// 	Name:  "adduser",
			// 	Usage: "add user to backend web server",
			// 	Action: func(ctx *cli.Context) error {
			// 		AddFirstUser()
			// 		return nil
			// 	},
			// },

			{
				Name:    "migrate",
				Aliases: []string{"m"},
				Usage:   "migrate database",
				Subcommands: []*cli.Command{
					{
						Name:  "gen",
						Usage: "--name <migration_name> generate db/migrations from serve/docs/ddl diff",
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:     "name",
								Aliases:  []string{"n"},
								Usage:    "migration name (used in filename suffix)",
								Required: true,
							},
							&cli.BoolFlag{
								Name:  "ai",
								Usage: "print AI rewrite prompt (DROP+CREATE -> ALTER TABLE). Optionally write to a .ai.md file.",
								Value: false,
							},
							&cli.StringFlag{
								Name:  "ai-file",
								Usage: "write AI prompt to file. If empty and --ai=true, defaults to <migrationsDir>/<version>_<name>.ai.md",
								Value: "",
							},
							&cli.StringFlag{
								Name:  "docs",
								Usage: "docs directory (default: serve/docs)",
								Value: "serve/docs",
							},
							&cli.StringFlag{
								Name:  "dir",
								Usage: "migrations directory (default: db/migrations)",
								Value: "db/migrations",
							},
						},
						Action: func(c *cli.Context) error {
							return migrateGen(c.String("name"), c.String("docs"), c.String("dir"), c.Bool("ai"), c.String("ai-file"))
						},
					},
					{
						Name:  "ddl-check",
						Usage: "compare serve/docs/table.sql with current DB schema (SHOW CREATE TABLE)",
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:  "snapshot",
								Usage: "snapshot file path (default: serve/docs/table.sql)",
								Value: "serve/docs/table.sql",
							},
							&cli.StringFlag{
								Name:  "database",
								Usage: "override database name for SHOW FULL TABLES FROM <db> (optional)",
								Value: "",
							},
							&cli.StringFlag{
								Name:  "table-re",
								Usage: "only compare tables matching this regex (optional)",
								Value: "",
							},
							&cli.BoolFlag{
								Name:  "canonicalize",
								Usage: "canonicalize snapshot by creating it in a temporary database and using SHOW CREATE TABLE output",
								Value: true,
							},
							&cli.StringFlag{
								Name:  "temp-db-prefix",
								Usage: "temporary database name prefix for canonicalize (default: __ddlcheck)",
								Value: "__ddlcheck",
							},
							&cli.BoolFlag{
								Name:  "keep-temp-db",
								Usage: "do not drop the temporary database (for debugging)",
								Value: false,
							},
							&cli.DurationFlag{
								Name:  "timeout",
								Usage: "DB query timeout",
								Value: 10 * time.Second,
							},
							&cli.BoolFlag{
								Name:  "exit-code",
								Usage: "return non-zero error when mismatch exists (for CI)",
								Value: true,
							},
						},
						Action: func(c *cli.Context) error {
							return migrateDDLCheck(ddlCheckArgs{
								snapshotPath: c.String("snapshot"),
								database:     c.String("database"),
								tableRe:      c.String("table-re"),
								timeout:      c.Duration("timeout"),
								exitCode:     c.Bool("exit-code"),
								canonicalize: c.Bool("canonicalize"),
								tempDBPrefix: c.String("temp-db-prefix"),
								keepTempDB:   c.Bool("keep-temp-db"),
							})
						},
					},
					{
						Name:  "up",
						Usage: "[-s] migrate database up",
						Flags: []cli.Flag{
							&cli.BoolFlag{
								Name:    "step",
								Aliases: []string{"s"},
								Usage:   "migrate database up step by step",
							},
						},
						Action: func(c *cli.Context) error {
							migrateUp(c.Bool("step"))
							return nil
						},
					},
					{
						Name:  "down",
						Usage: "[-s] migrate database down",
						Flags: []cli.Flag{
							&cli.BoolFlag{
								Name:    "step",
								Aliases: []string{"s"},
								Usage:   "migrate database down step by step",
							},
						},
						Action: func(c *cli.Context) error {
							migrateDown(c.Bool("step"))
							return nil
						},
					},
					{
						Name:  "status",
						Usage: "show database status",
						Action: func(c *cli.Context) error {
							migrateStatus()
							return nil
						},
					},
					{
						Name:  "force",
						Usage: "-v <version> force migrate database to a specific version",
						Flags: []cli.Flag{
							&cli.IntFlag{
								Name:    "version",
								Aliases: []string{"v"},
								Usage:   "the version to migrate to",
								Value:   -1,
							},
						},
						Action: func(c *cli.Context) error {
							migrateForce(c.Int("version"))
							return nil
						},
					},
				},
			},
		},
		// 默认执行 greet 命令
		Action: func(c *cli.Context) error {
			fmt.Printf("\nerror args = %v\n\n", c.Args().Slice())
			return cli.ShowAppHelp(c)
		},
	}

	if err := cmdline.Run(os.Args); err != nil {
		log.Fatal(err)
	}
}

// func handleStop() {
// 	fmt.Println("停止服务器")
// 	// TODO: 在这里添加停止服务器的逻辑
// }

// func handleStatus() {
// 	fmt.Println("查看服务器状态")
// 	// TODO: 在这里添加检查服务器状态的逻辑
// }
