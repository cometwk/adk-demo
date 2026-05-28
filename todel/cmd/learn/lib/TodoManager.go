package lib

import (
	"fmt"
	"strings"
)

// TodoItem represents a single task entry.
type TodoItem struct {
	Content    string
	Status     string
	ActiveForm string
}

// TodoManager manages a structured task list with enforced constraints.
//
// Key Design Decisions:
// 1. Max 20 items: Prevents endless lists
// 2. One in_progress: Forces focus on ONE thing at a time
// 3. Required fields: Each item needs content, status, and activeForm
//
// The ActiveForm field is the present tense form shown when status is "in_progress".
// Example: Content="Add tests", ActiveForm="Adding unit tests..."
type TodoManager struct {
	items []TodoItem
}

// Update validates and updates the todo list.
//
// The model sends a complete new list each time. We validate it,
// store it, and return a rendered view.
//
// Validation Rules:
// - Each item must have: content, status, activeForm
// - Status must be: pending | in_progress | completed
// - Only ONE item can be in_progress at a time
// - Maximum 20 items allowed
func (t *TodoManager) Update(items []TodoItem) (string, error) {
	validated := make([]TodoItem, 0, len(items))
	inProgressCount := 0

	for i, item := range items {
		content := strings.TrimSpace(item.Content)
		status := strings.ToLower(strings.TrimSpace(item.Status))
		activeForm := strings.TrimSpace(item.ActiveForm)

		if content == "" {
			return "", fmt.Errorf("Item %d: content required", i)
		}
		if status != "pending" && status != "in_progress" && status != "completed" {
			return "", fmt.Errorf("Item %d: invalid status '%s'", i, status)
		}
		if activeForm == "" {
			return "", fmt.Errorf("Item %d: activeForm required", i)
		}

		if status == "in_progress" {
			inProgressCount++
		}

		validated = append(validated, TodoItem{
			Content:    content,
			Status:     status,
			ActiveForm: activeForm,
		})
	}

	if len(validated) > 20 {
		return "", fmt.Errorf("Max 20 todos allowed")
	}
	if inProgressCount > 1 {
		return "", fmt.Errorf("Only one task can be in_progress at a time")
	}

	t.items = validated
	return t.Render(), nil
}

// Render renders the todo list as human-readable text.
//
// Format:
// [x] Completed task
// [>] In progress task <- Doing something...
// [ ] Pending task
//
// (2/3 completed)
func (t *TodoManager) Render() string {
	if len(t.items) == 0 {
		return "No todos."
	}

	lines := make([]string, 0, len(t.items)+1)
	for _, item := range t.items {
		switch item.Status {
		case "completed":
			lines = append(lines, fmt.Sprintf("[x] %s", item.Content))
		case "in_progress":
			lines = append(lines, fmt.Sprintf("[>] %s <- %s", item.Content, item.ActiveForm))
		default:
			lines = append(lines, fmt.Sprintf("[ ] %s", item.Content))
		}
	}

	completed := 0
	for _, item := range t.items {
		if item.Status == "completed" {
			completed++
		}
	}
	lines = append(lines, fmt.Sprintf("\n(%d/%d completed)", completed, len(t.items)))

	return strings.Join(lines, "\n")
}

// Global todo manager instance
var TODO = &TodoManager{}
