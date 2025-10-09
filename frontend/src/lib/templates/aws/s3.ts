import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const s3: TemplateFns = {
  main: () => `resource \"aws_s3_bucket\" \"this\" {
      bucket = var.name
      acl    = "private"
      versioning { enabled = var.versioning }
      tags = var.tags
    }`,
  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {}, options = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `    ${k} = "${v}"`)
      .join('\n');
    return `variable "name" {
  description = "S3 bucket name (globally unique)"
  type        = string
  default     = "${name}"
}

variable "region" {
  description = "AWS region (e.g., us-east-1)"
  type        = string
  default     = "${region ?? ''}"
}

variable "versioning" {
  description = "Enable versioning for objects"
  type        = bool
  default     = ${options.versioning ?? false}
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {
${tagLines}
  }
}
    `;
  },

  outputs: () => `output "bucket_id" { value = aws_s3_bucket.this.id }
    `,

  tfvars: (inputs: any) => {
    const { name, region, tags = {}, options = {} } = inputs;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `name = "${name}"
    region = "${region ?? ''}"
    versioning = ${options.versioning ?? false}
    tags = {
    ${tagLines}
    }
    `;
  },
};
