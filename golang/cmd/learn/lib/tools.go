package lib

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

const maxOutputBytes = 50000

// =============================================================================
// Tool Definitions (v1 tools + TodoWrite)
// =============================================================================

type bashInput struct {
	Command string `json:"command" jsonschema:"shell command to execute"`
}

type toolOutput struct {
	Result string `json:"result" jsonschema:"command output (stdout + stderr)"`
}

type readInput struct {
	Path  string `json:"path" jsonschema:"file path to read"`
	Limit int    `json:"limit,omitempty" jsonschema:"max lines to return"`
}

type writeInput struct {
	Path    string `json:"path" jsonschema:"file path to write"`
	Content string `json:"content" jsonschema:"file content"`
}

type editInput struct {
	Path    string `json:"path" jsonschema:"file path to edit"`
	OldText string `json:"old_text" jsonschema:"exact text to replace"`
	NewText string `json:"new_text" jsonschema:"replacement text"`
}

type todoItemInput struct {
	Content    string `json:"content"`
	Status     string `json:"status"`
	ActiveForm string `json:"activeForm"`
}

type todoInput struct {
	Items []todoItemInput `json:"items"`
}

// =============================================================================
// Tool Implementations (v1 + TodoWrite)
// =============================================================================

func safePath(p string) (string, error) {
	if strings.TrimSpace(p) == "" {
		return "", fmt.Errorf("path is required")
	}

	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	var abs string
	if filepath.IsAbs(p) {
		abs = filepath.Clean(p)
	} else {
		abs = filepath.Join(wd, p)
	}
	abs, err = filepath.Abs(abs)
	if err != nil {
		return "", err
	}

	wdAbs, err := filepath.Abs(wd)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(wdAbs, abs)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes workspace: %s", p)
	}
	return abs, nil
}

func clampOutput(text string) string {
	if len(text) > maxOutputBytes {
		return text[:maxOutputBytes]
	}
	return text
}

func runBash(ctx tool.Context, input bashInput) (toolOutput, error) {
	command := strings.TrimSpace(input.Command)
	if command == "" {
		return toolOutput{}, fmt.Errorf("command is required")
	}

	execCtx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	cmd := exec.CommandContext(execCtx, "bash", "-lc", command)
	output, err := cmd.CombinedOutput()
	result := string(output)
	if execCtx.Err() == context.DeadlineExceeded {
		return toolOutput{Result: result + "\n[timeout] command exceeded 300s"}, nil
	}
	if err != nil {
		return toolOutput{Result: result + "\n[error] " + err.Error()}, nil
	}
	return toolOutput{Result: result}, nil
}

func runRead(ctx tool.Context, input readInput) (toolOutput, error) {
	path, err := safePath(input.Path)
	if err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}

	text := string(data)
	lines := []string{}
	if text != "" {
		lines = strings.Split(strings.TrimRight(text, "\n"), "\n")
	}

	if input.Limit > 0 && input.Limit < len(lines) {
		lines = append(lines[:input.Limit], fmt.Sprintf("... (%d more)", len(lines)-input.Limit))
	}

	result := strings.Join(lines, "\n")
	return toolOutput{Result: clampOutput(result)}, nil
}

func runWrite(ctx tool.Context, input writeInput) (toolOutput, error) {
	path, err := safePath(input.Path)
	if err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}
	if err := os.WriteFile(path, []byte(input.Content), 0o644); err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}
	return toolOutput{Result: fmt.Sprintf("Wrote %d bytes to %s", len(input.Content), input.Path)}, nil
}

func runEdit(ctx tool.Context, input editInput) (toolOutput, error) {
	path, err := safePath(input.Path)
	if err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}
	if !strings.Contains(string(content), input.OldText) {
		return toolOutput{Result: fmt.Sprintf("Error: Text not found in %s", input.Path)}, nil
	}

	updated := strings.Replace(string(content), input.OldText, input.NewText, 1)
	if err := os.WriteFile(path, []byte(updated), 0o644); err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}
	return toolOutput{Result: fmt.Sprintf("Edited %s", input.Path)}, nil
}

func runTodo(ctx tool.Context, input todoInput) (toolOutput, error) {
	items := make([]TodoItem, 0, len(input.Items))
	for _, item := range input.Items {
		items = append(items, TodoItem{
			Content:    item.Content,
			Status:     item.Status,
			ActiveForm: item.ActiveForm,
		})
	}

	result, err := TODO.Update(items)
	if err != nil {
		return toolOutput{Result: "Error: " + err.Error()}, nil
	}
	return toolOutput{Result: result}, nil
}

func createBashTool() tool.Tool {
	bashTool, err := functiontool.New(functiontool.Config{
		Name:        "bash",
		Description: "Run a shell command.",
	}, runBash)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return bashTool
}

func createReadFileTool() tool.Tool {
	readTool, err := functiontool.New(functiontool.Config{
		Name:        "read_file",
		Description: "Read file contents.",
	}, runRead)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return readTool
}

func createWriteFileTool() tool.Tool {
	writeTool, err := functiontool.New(functiontool.Config{
		Name:        "write_file",
		Description: "Write content to file.",
	}, runWrite)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return writeTool
}

func createEditFileTool() tool.Tool {
	editTool, err := functiontool.New(functiontool.Config{
		Name:        "edit_file",
		Description: "Replace exact text in file.",
	}, runEdit)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return editTool
}

func createTodoWriteTool() tool.Tool {
	todoTool, err := functiontool.New(functiontool.Config{
		Name:        "TodoWrite",
		Description: "Update the task list. Use to plan and track progress.",
	}, runTodo)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return todoTool
}

var TOOLS = []tool.Tool{
	createBashTool(),
	createReadFileTool(),
	createWriteFileTool(),
	createEditFileTool(),
	createTodoWriteTool(),
}
