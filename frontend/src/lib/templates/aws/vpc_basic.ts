import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const vpc_basic: TemplateFns = {
  main: (inputs: TemplateInputs) => `# Creates a VPC, a public subnet, IGW, route table and a basic SG
resource "aws_vpc" "this" {
  cidr_block = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = merge(var.tags, { Name = var.name })
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.this.id
  cidr_block = var.public_subnet_cidr
  availability_zone = var.availability_zone
  tags = merge(var.tags, { Name = "\${var.name}-public" })
}

resource "aws_internet_gateway" "this" { vpc_id = aws_vpc.this.id }

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route { cidr_block = "0.0.0.0/0" gateway_id = aws_internet_gateway.this.id }
}

resource "aws_route_table_association" "public_assoc" {
  subnet_id = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "basic" {
  name   = "\${var.name}-basic-sg"
  vpc_id = aws_vpc.this.id
  description = "Basic public security group"
  ingress { from_port = 22 to_port = 22 protocol = "tcp" cidr_blocks = ["0.0.0.0/0"] }
  egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] }
  tags = var.tags
}
`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `    ${k} = "${v}"`)
      .join('\n');
    return `variable "name" {
  type    = string
  default = "${name}"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.0.1.0/24"
}

variable "availability_zone" {
  type    = string
  default = "${region ? region + 'a' : ''}"
}

variable "tags" {
  type    = map(string)
  default = {
${tagLines}
  }
}

`;
  },

  outputs: () => `output "vpc_id" {
  description = "The VPC ID"
  value       = aws_vpc.this.id
}

output "public_subnet_id" {
  description = "The public subnet ID"
  value       = aws_subnet.public.id
}

output "basic_sg_id" {
  description = "The basic security group ID"
  value       = aws_security_group.basic.id
}
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `name = "${name}"
vpc_cidr = "10.0.0.0/16"
public_subnet_cidr = "10.0.1.0/24"
availability_zone = "${region ? region + 'a' : ''}"
tags = {
${tagLines}
}
`;
  },
};
