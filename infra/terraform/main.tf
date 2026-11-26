terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

provider "aws" { region = var.region }

locals {
  tags = { Project = var.project, Purpose = "capstone-acceptance-testbed" }
}

# ---------------------------------------------------------------- image registry
resource "aws_ecr_repository" "sut" {
  name                 = "${var.project}-sut"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = local.tags
}

resource "aws_ecr_repository" "campaign" {
  name                 = "${var.project}-campaign"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = local.tags
}

# ---------------------------------------------------------------- evidence plane
resource "aws_s3_bucket" "evidence" {
  bucket = "${var.project}-evidence-${data.aws_caller_identity.me.account_id}"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket                  = aws_s3_bucket.evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    id     = "trace-archival"
    status = "Enabled"
    filter {}
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = var.trace_retention_days
      storage_class = "GLACIER"
    }
  }
}

data "aws_caller_identity" "me" {}

# ---------------------------------------------------------------- observability
resource "aws_cloudwatch_log_group" "campaign" {
  name              = "/${var.project}/campaign"
  retention_in_days = 14
  tags              = local.tags
}

# ---------------------------------------------------------------- execution plane
resource "aws_ecs_cluster" "testbed" {
  name = "${var.project}-testbed"
  setting { name = "containerInsights" value = "enabled" }
  tags = local.tags
}

resource "aws_iam_role" "task_execution" {
  name = "${var.project}-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name = "${var.project}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "task_evidence" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.evidence.arn, "${aws_s3_bucket.evidence.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.campaign.arn}:*"
      }
    ]
  })
}

resource "aws_ecs_task_definition" "sut" {
  family                   = "${var.project}-sut"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name      = "sut"
    image     = var.sut_image
    essential = true
    portMappings = [{ containerPort = 4173, protocol = "tcp" }]
    environment = [
      { name = "SUT_PORT", value = "4173" },
      { name = "ACCOUNTS", value = "8" },
      { name = "LATENCY_BASE", value = "80" },
      { name = "LATENCY_SPREAD", value = "240" },
      { name = "RENDER_DELAY", value = "100" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.campaign.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "sut"
      }
    }
  }])
  tags = local.tags
}

resource "aws_ecs_task_definition" "campaign" {
  family                   = "${var.project}-campaign"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name      = "campaign"
    image     = var.campaign_image
    essential = true
    command   = ["node", "scripts/campaign.mjs", "--condition", "C", "--reps", "50", "--workers", "4"]
    environment = [
      { name = "BASE_URL", value = "http://sut.local:4173" },
      { name = "WORKERS", value = "4" },
      { name = "BROWSERS", value = "chromium,firefox,webkit" },
      { name = "EVIDENCE_BUCKET", value = aws_s3_bucket.evidence.bucket }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.campaign.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "campaign"
      }
    }
  }])
  tags = local.tags
}

# Fault injection (NT-1: intermittent failure, NT-5: partial failure).
# The SUT task ARN is resolved at experiment time so the same template can be reused.
resource "aws_fis_experiment_template" "nt1_network_latency" {
  description = "NT-1: inject intermittent network latency against the SUT task"
  role_arn    = aws_iam_role.fis.arn
  tags        = local.tags

  stop_condition {
    source = "none"
  }

  action {
    name      = "latency"
    action_id = "aws:ecs:task-network-latency"
    target { key = "Tasks" value = "sut-task" }
    parameter {
      key   = "duration"
      value = "PT5M"
    }
    parameter {
      key   = "delay"
      value = "2000"
    }
  }

  target {
    name           = "sut-task"
    resource_type  = "aws:ecs:task"
    selection_mode = "ALL"
    resource_tag {
      key   = "Project"
      value = var.project
    }
  }
}

resource "aws_iam_role" "fis" {
  name = "${var.project}-fis"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "fis.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}
