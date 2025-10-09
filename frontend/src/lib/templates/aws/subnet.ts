import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const subnet: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_subnet" "this" {
  vpc_id     = var.vpc_id
  cidr_block = var.subnet_cidr
  availability_zone = var.availability_zone
  tags = merge(var.tags, { Name = var.name })
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

variable "vpc_id" {
  type    = string
  default = ""
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

  outputs: () => `output "subnet_id" { 
    value = aws_subnet.this.id 
  }
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `name = "${name}"
vpc_id = ""
subnet_cidr = "10.0.1.0/24"
availability_zone = "${region ? region + 'a' : ''}"
tags = {
${tagLines}
}
`;
  },
};
