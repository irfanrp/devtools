import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const vpc: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_vpc" "this" {
  cidr_block = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = merge(var.tags, { Name = var.name })
}

resource "aws_subnet" "this" {
  vpc_id     = aws_vpc.this.id
  cidr_block = var.subnet_cidr
  availability_zone = var.availability_zone
  tags = merge(var.tags, { Name = "\${var.name}-subnet" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags = merge(var.tags, { Name = "\${var.name}-igw" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(var.tags, { Name = "\${var.name}-public-rt" })
}

resource "aws_route_table_association" "public_assoc" {
  subnet_id      = aws_subnet.this.id
  route_table_id = aws_route_table.public.id
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

variable "subnet_cidr" {
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

output "subnet_id" {
  description = "The subnet ID"
  value       = aws_subnet.this.id
}

output "igw_id" {
  description = "The internet gateway ID"
  value       = aws_internet_gateway.this.id
}
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `name = "${name}"
vpc_cidr = "10.0.0.0/16"
subnet_cidr = "10.0.1.0/24"
availability_zone = "${region ? region + 'a' : ''}"
tags = {
${tagLines}
}
`;
  },
};
