import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const alb: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_lb" "this" {
  name               = var.name
  internal           = var.internal
  load_balancer_type = "application"
  subnets            = var.subnets
  security_groups    = var.security_groups
  tags               = var.tags
}

resource "aws_lb_target_group" "this" {
  name     = "${inputs.name}-tg"
  port     = var.target_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id
}

resource "aws_lb_listener" "this" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      .join('\n');
    const tagBlock = Object.keys(tags).length ? `{
${tagLines}
}` : "{}";

    return `variable "name" {
  description = "Name prefix for ALB"
  type        = string
  default     = "${name}-alb"
}

variable "internal" {
  description = "Whether to create an internal load balancer"
  type        = bool
  default     = false
}

variable "subnets" {
  description = "List of subnet IDs for the ALB"
  type        = list(string)
  default     = []
}

variable "security_groups" {
  description = "List of security group IDs to attach to the ALB"
  type        = list(string)
  default     = []
}

variable "vpc_id" {
  description = "VPC id where target group will be created"
  type        = string
  default     = ""
}

variable "target_port" {
  description = "Port for target group"
  type        = number
  default     = 80
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = ${tagBlock}
}
`;
  },

  outputs: () => `output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "DNS name of the ALB"
  value       = aws_lb.this.dns_name
}

output "target_group_arn" {
  description = "ARN of the created target group"
  value       = aws_lb_target_group.this.arn
}

output "listener_arn" {
  description = "ARN of the created listener"
  value       = aws_lb_listener.this.arn
}

output "vpc_id" {
  description = "VPC ID used for the target group"
  value       = var.vpc_id
}

output "target_port" {
  description = "Port configured on target group"
  value       = var.target_port
}
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      .join('\n');
    const tagBlock = Object.keys(tags).length ? `{
${tagLines}
}` : "{}";
    return `name = "${name}-alb"
internal = false
subnets = []
security_groups = []

vpc_id = ""

tags = ${tagBlock}
`;
  },
};
