import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const security_group: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_security_group" "this" {
  name        = var.name
  description = var.description
  vpc_id      = var.vpc_id

  ingress {
    from_port   = var.ingress_from_port
    to_port     = var.ingress_to_port
    protocol    = var.ingress_protocol
    cidr_blocks = var.ingress_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `    ${k} = "${v}"`)
      .join('\n');
    return `variable "name" {
  type    = string
  default = "${name}"
}

variable "description" {
  type    = string
  default = "Security group for ${name}"
}

variable "vpc_id" {
  type    = string
  default = ""
}

variable "ingress_from_port" {
  type    = number
  default = 22
}

variable "ingress_to_port" {
  type    = number
  default = 22
}

variable "ingress_protocol" {
  type    = string
  default = "tcp"
}

variable "ingress_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "tags" {
  type    = map(string)
  default = {
${tagLines}
  }
}

`;
  },

  outputs: () => `output "security_group_id" {
    value = aws_security_group.this.id 
 }
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `name = "${name}"
vpc_id = ""
ingress_from_port = 22
ingress_to_port = 22
ingress_protocol = "tcp"
ingress_cidr_blocks = ["0.0.0.0/0"]
tags = {
${tagLines}
}
`;
  },
};
