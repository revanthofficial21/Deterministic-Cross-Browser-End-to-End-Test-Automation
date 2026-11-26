output "ecr_sut" { value = aws_ecr_repository.sut.repository_url }
output "ecr_campaign" { value = aws_ecr_repository.campaign.repository_url }
output "evidence_bucket" { value = aws_s3_bucket.evidence.bucket }
output "cluster" { value = aws_ecs_cluster.testbed.name }
output "sut_task_definition" { value = aws_ecs_task_definition.sut.arn }
output "campaign_task_definition" { value = aws_ecs_task_definition.campaign.arn }
output "fis_experiment" { value = aws_fis_experiment_template.nt1_network_latency.id }
