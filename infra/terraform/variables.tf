variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "dx-e2e"
}

variable "task_cpu" {
  description = "Frozen resource envelope: CPU units per campaign task (AC-4)"
  type        = number
  default     = 2048
}

variable "task_memory" {
  type    = number
  default = 4096
}

variable "sut_image" {
  description = "Digest-pinned SUT image, e.g. <acct>.dkr.ecr.<region>.amazonaws.com/dx-e2e-sut@sha256:..."
  type        = string
}

variable "campaign_image" {
  description = "Digest-pinned campaign image (node + three browser engines)"
  type        = string
}

variable "trace_retention_days" {
  type    = number
  default = 90
}
