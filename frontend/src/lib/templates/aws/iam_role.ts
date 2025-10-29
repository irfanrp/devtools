import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const iam_role: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_iam_role" "this" {
  name = var.name
  assume_role_policy = var.assume_role_policy
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "this" {
  role = aws_iam_role.this.name
  policy_arn = var.policy_arn
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
  description = "Name of the IAM role"
  type        = string
  default     = "${name}-role"
}

variable "assume_role_policy" {
  description = "IAM assume role policy in JSON (use heredoc for multiline JSON)"
  type        = string
  default     = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Effect": "Allow"
    }
  ]
}
EOF
}

variable "policy_arn" {
  description = "ARN of the managed policy to attach to the role"
  type        = string
  default     = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

variable "tags" {
  description = "Map of tags to apply to resources"
  type        = map(string)
  default     = ${tagBlock}
}
`;
  },

  outputs: () => `output "role_name" {
  description = "Name of the created IAM role"
  value       = aws_iam_role.this.name
}

output "role_id" {
  description = "Unique ID of the IAM role"
  value       = aws_iam_role.this.id
}

output "role_arn" {
  description = "ARN of the created IAM role"
  value       = aws_iam_role.this.arn
}

output "attached_policy_arn" {
  description = "The managed policy ARN attached to the role (from variable)"
  value       = var.policy_arn
}

output "policy_attachment_name" {
  description = "Name of the role policy attachment resource"
  value       = aws_iam_role_policy_attachment.this.id
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

    return `name = "${name}-role"
policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"

tags = ${tfTagBlock}
`;
  },
};
