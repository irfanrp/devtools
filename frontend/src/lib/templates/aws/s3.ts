import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const s3: TemplateFns = {
  main: () => `resource "aws_s3_bucket" "this" {
  bucket = var.name
  acl    = var.acl
  force_destroy = var.force_destroy

  versioning {
    enabled = var.versioning
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = var.sse_algorithm
        kms_master_key_id = var.kms_key_id
      }
    }
  }

  lifecycle_rule {
    id      = "expire-objects"
    enabled = var.lifecycle_enabled
    expiration {
      days = var.lifecycle_days
    }
  }

  logging {
    target_bucket = var.logging_target_bucket
    target_prefix = var.logging_target_prefix
  }

  website {
    index_document = var.website_index_document
    error_document = var.website_error_document
  }

  tags = merge(var.tags, { Name = var.name })
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id
  block_public_acls       = var.block_public_acls
  block_public_policy     = var.block_public_policy
  ignore_public_acls      = var.ignore_public_acls
  restrict_public_buckets = var.restrict_public_buckets
}

resource "aws_s3_bucket_policy" "this" {
  count  = var.create_bucket_policy ? 1 : 0
  bucket = aws_s3_bucket.this.id
  policy = var.bucket_policy
}
`,
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

variable "acl" {
  description = "Canned ACL for the bucket"
  type        = string
  default     = "private"
}

variable "force_destroy" {
  description = "Allow Terraform to destroy non-empty buckets"
  type        = bool
  default     = false
}

variable "versioning" {
  description = "Enable versioning for objects"
  type        = bool
  default     = ${options.versioning ?? false}
}

variable "sse_algorithm" {
  description = "Server-side encryption algorithm (AES256 or aws:kms)"
  type        = string
  default     = "AES256"
}

variable "kms_key_id" {
  description = "KMS key id to use when sse_algorithm = aws:kms"
  type        = string
  default     = ""
}

variable "lifecycle_enabled" {
  type    = bool
  default = false
}

variable "lifecycle_days" {
  type    = number
  default = 365
}

variable "logging_target_bucket" {
  type    = string
  default = ""
}

variable "logging_target_prefix" {
  type    = string
  default = ""
}

variable "website_index_document" {
  type    = string
  default = "index.html"
}

variable "website_error_document" {
  type    = string
  default = "error.html"
}

variable "block_public_acls" {
  type    = bool
  default = true
}

variable "block_public_policy" {
  type    = bool
  default = true
}

variable "ignore_public_acls" {
  type    = bool
  default = true
}

variable "restrict_public_buckets" {
  type    = bool
  default = true
}

variable "create_bucket_policy" {
  type    = bool
  default = false
}

variable "bucket_policy" {
  description = "JSON string for the bucket policy (used when create_bucket_policy=true)"
  type        = string
  default     = ""
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

  outputs: () => `output "bucket_id" {
  description = "The S3 bucket ID"
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "The S3 bucket ARN"
  value       = aws_s3_bucket.this.arn
}

output "bucket_domain_name" {
  description = "The bucket domain name"
  value       = aws_s3_bucket.this.bucket_domain_name
}

output "bucket_regional_domain_name" {
  description = "The regional domain name"
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}

output "website_endpoint" {
  description = "Website endpoint (if website hosting enabled)"
  value       = aws_s3_bucket.this.website_endpoint
}

output "logging_target_bucket" {
  description = "Logging target bucket"
  value       = var.logging_target_bucket
}

output "public_access_block" {
  description = "Public access block settings (as configured)"
  value = {
    block_public_acls       = var.block_public_acls
    block_public_policy     = var.block_public_policy
    ignore_public_acls      = var.ignore_public_acls
    restrict_public_buckets = var.restrict_public_buckets
  }
}
`,

  tfvars: (inputs: any) => {
    const { name, region, tags = {}, options = {} } = inputs;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');

    // allow UI to pass options for public access block and other toggles
    const versioning = options.versioning ?? false;
    const force_destroy = options.force_destroy ?? false;
    const sse_algorithm = options.sse_algorithm ?? "AES256";
    const kms_key_id = options.kms_key_id ?? "";
    const lifecycle_enabled = options.lifecycle_enabled ?? false;
    const lifecycle_days = options.lifecycle_days ?? 365;
    const logging_target_bucket = options.logging_target_bucket ?? "";
    const logging_target_prefix = options.logging_target_prefix ?? `${name}/logs/`;
    const website_index_document = options.website_index_document ?? "index.html";
    const website_error_document = options.website_error_document ?? "error.html";
    const block_public_acls = options.block_public_acls ?? true;
    const block_public_policy = options.block_public_policy ?? true;
    const ignore_public_acls = options.ignore_public_acls ?? true;
    const restrict_public_buckets = options.restrict_public_buckets ?? true;
    const create_bucket_policy = options.create_bucket_policy ?? false;
    const bucket_policy = options.bucket_policy ?? "";

    return `name = "${name}"
region = "${region ?? ''}"
acl = "private"
force_destroy = ${force_destroy}
versioning = ${versioning}
sse_algorithm = "${sse_algorithm}"
kms_key_id = "${kms_key_id}"
lifecycle_enabled = ${lifecycle_enabled}
lifecycle_days = ${lifecycle_days}
logging_target_bucket = "${logging_target_bucket}"
logging_target_prefix = "${logging_target_prefix}"
website_index_document = "${website_index_document}"
website_error_document = "${website_error_document}"
block_public_acls = ${block_public_acls}
block_public_policy = ${block_public_policy}
ignore_public_acls = ${ignore_public_acls}
restrict_public_buckets = ${restrict_public_buckets}
create_bucket_policy = ${create_bucket_policy}
bucket_policy = "${bucket_policy}"
tags = {
${tagLines}
}
`;
  },
};
