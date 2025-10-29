import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const rds: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_db_instance" "this" {
  identifier = var.identifier
  allocated_storage = var.allocated_storage
  engine = var.engine
  engine_version = var.engine_version
  instance_class = var.instance_class
  name = var.db_name
  username = var.username
  password = var.password
  parameter_group_name = var.parameter_group_name != "" ? var.parameter_group_name : null
  skip_final_snapshot = true
  publicly_accessible = var.publicly_accessible
  vpc_security_group_ids = var.vpc_security_group_ids
  tags = merge(var.tags, { Name = var.identifier })
}`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      .join('\n');
    const tagBlock = Object.keys(tags).length ? `{
${tagLines}
}` : "{}";

    return `variable "identifier" {
  description = "RDS instance identifier"
  type        = string
  default     = "${name}-db"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "${region ?? ''}"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "engine" {
  description = "Database engine"
  type        = string
  default     = "mysql"
}

variable "engine_version" {
  description = "Database engine version"
  type        = string
  default     = "8.0"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "appdb"
}

variable "username" {
  description = "Master username"
  type        = string
  default     = "admin"
}

variable "password" {
  description = "Master password (change in production)"
  type        = string
  default     = "ChangeMe123!"
}

variable "parameter_group_name" {
  description = "Optional DB parameter group name"
  type        = string
  default     = ""
}

variable "publicly_accessible" {
  description = "Whether the DB instance is publicly accessible"
  type        = bool
  default     = false
}

variable "vpc_security_group_ids" {
  description = "List of VPC security group IDs to attach"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = ${tagBlock}
}
`;
  },

  outputs: () => `output "endpoint" {
  description = "Connection endpoint for the DB instance (DNS)"
  value       = aws_db_instance.this.endpoint
}

output "address" {
  description = "Address of the DB instance"
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Port the DB is listening on"
  value       = aws_db_instance.this.port
}

output "identifier" {
  description = "The RDS instance identifier"
  value       = aws_db_instance.this.id
}

output "arn" {
  description = "ARN of the DB instance"
  value       = aws_db_instance.this.arn
}

output "instance_class" {
  description = "Instance class of the DB"
  value       = aws_db_instance.this.instance_class
}

output "publicly_accessible" {
  description = "Whether the DB instance is publicly accessible"
  value       = aws_db_instance.this.publicly_accessible
}
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tfTagLines = Object.entries(tags)
      .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      .join('\n');
    const tfTagBlock = Object.keys(tags).length ? `{
${tfTagLines}
}` : "{}";
    return `identifier = "${name}-db"
region = "${region ?? ''}"
allocated_storage = 20
engine = "mysql"
engine_version = "8.0"
instance_class = "db.t3.micro"
db_name = "appdb"
username = "admin"
password = "ChangeMe123!"
publicly_accessible = false

tags = ${tfTagBlock}
`;
  },
};
