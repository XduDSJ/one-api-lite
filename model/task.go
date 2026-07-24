package model

import "time"

type TaskStatus string

const (
	TaskStatusNotStart   TaskStatus = "not_start"
	TaskStatusSubmitted  TaskStatus = "submitted"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusSuccess    TaskStatus = "success"
	TaskStatusFailure    TaskStatus = "failure"
)

type Task struct {
	ID          int64      `json:"id" gorm:"primaryKey;autoIncrement"`
	TaskID      string     `json:"task_id" gorm:"index"`   // 上游返回的任务 ID
	Platform    string     `json:"platform" gorm:"index"`  // 平台标识：kling, sora, suno, zimage...
	Action      string     `json:"action"`                 // 动作：video_generation, music_generation, image_generation
	ChannelId   int        `json:"channel_id" gorm:"index"` // 渠道 ID
	UserId      int        `json:"user_id" gorm:"index"`   // 用户 ID
	TokenId     int        `json:"token_id"`               // 令牌 ID
	Status      TaskStatus `json:"status" gorm:"index"`    // 任务状态
	FailReason  string     `json:"fail_reason"`            // 失败原因
	Progress    string     `json:"progress"`               // 进度：如 "50%"
	RequestBody string     `json:"request_body"`           // 原始请求 JSON（用于重试）
	Result      string     `json:"result"`                 // 结果 JSON（URL 等）
	SubmitTime  int64      `json:"submit_time"`
	FinishTime  int64      `json:"finish_time"`
	CreatedAt   int64      `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   int64      `json:"updated_at" gorm:"autoUpdateTime"`
}

func (Task) TableName() string {
	return "tasks"
}

// CreateTask 创建任务记录
func CreateTask(task *Task) error {
	return DB.Create(task).Error
}

// GetTaskByID 根据 ID 获取任务
func GetTaskByID(id int64) (*Task, error) {
	var task Task
	err := DB.Where("id = ?", id).First(&task).Error
	return &task, err
}

// GetTaskByTaskID 根据上游任务 ID 获取任务
func GetTaskByTaskID(taskID string) (*Task, error) {
	var task Task
	err := DB.Where("task_id = ?", taskID).First(&task).Error
	return &task, err
}

// GetPendingTasks 获取所有未完成任务（submitted 或 in_progress）
func GetPendingTasks() ([]Task, error) {
	var tasks []Task
	err := DB.Where("status IN ?", []TaskStatus{TaskStatusSubmitted, TaskStatusInProgress}).Find(&tasks).Error
	return tasks, err
}

// GetTasksByUserId 获取用户的任务列表（分页）
func GetTasksByUserId(userId int, page int, pageSize int) ([]Task, int64, error) {
	var tasks []Task
	var total int64
	db := DB.Model(&Task{}).Where("user_id = ?", userId)
	db.Count(&total)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	err := db.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&tasks).Error
	return tasks, total, err
}

// UpdateTaskStatus 更新任务状态
func UpdateTaskStatus(id int64, status TaskStatus, progress string, result string, failReason string) error {
	updates := map[string]any{
		"status":   status,
		"progress": progress,
	}
	if result != "" {
		updates["result"] = result
	}
	if failReason != "" {
		updates["fail_reason"] = failReason
	}
	if status == TaskStatusSuccess || status == TaskStatusFailure {
		updates["finish_time"] = time.Now().Unix()
	}
	return DB.Model(&Task{}).Where("id = ?", id).Updates(updates).Error
}
