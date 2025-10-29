import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const route53: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_route53_zone" "this" {
  name = var.zone_name
}

resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.this.zone_id
  name    = var.record_name
  type    = "A"
  ttl     = 300
  records = var.records
}`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      .join('\n');
    const tagBlock = Object.keys(tags).length ? `{
${tagLines}
}` : "{}";

    return `variable "zone_name" {
  description = "The DNS zone name (e.g. example.com)"
  type        = string
  default     = "example.com"
}

variable "record_name" {
  description = "Record name (subdomain or @ for root)"
  type        = string
  default     = "www"
}

variable "records" {
  description = "List of record values (A record IPs or other types)"
  type        = list(string)
  default     = ["1.2.3.4"]
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = ${tagBlock}
}
`;
  },

  outputs: () => `output "zone_id" {
  description = "The Route53 hosted zone ID"
  value       = aws_route53_zone.this.zone_id
}

output "zone_name" {
  description = "The configured zone name"
  value       = var.zone_name
}

output "record_name" {
  description = "The record name created"
  value       = var.record_name
}

output "record_type" {
  description = "DNS record type"
  value       = "A"
}

output "record_ttl" {
  description = "TTL for the DNS record"
  value       = 300
}

output "record_records" {
  description = "The record values"
  value       = var.records
}

output "record_fqdn" {
  description = "Fully qualified domain name of the record"
  value       = aws_route53_record.www.fqdn
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
    return `zone_name = "example.com"
record_name = "www"
records = ["1.2.3.4"]

tags = ${tagBlock}
`;
  },
};
