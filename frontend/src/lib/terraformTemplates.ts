import { Provider, TemplateInputs, TemplateFns } from './templateTypes';
// Re-export types for backward compatibility with other modules that
// import these from terraformTemplates.ts
export type { Provider, TemplateInputs, TemplateFns } from './templateTypes';

/**
 * Convert provider name to its Terraform prefix
 */
function resourcePrefix(provider: Provider): string {
  switch (provider) {
    case 'aws':
      return 'aws';
    case 'gcp':
      return 'google';
    case 'azure':
      return 'azurerm';
  }
}

import { ec2 } from './templates/aws/ec2';
import { s3 } from './templates/aws/s3';
import { vpc } from './templates/aws/vpc';
import { subnet as subnetTpl } from './templates/aws/subnet';
import { security_group as securityGroup } from './templates/aws/security_group';
import { vpc_basic } from './templates/aws/vpc_basic';
import { rds } from './templates/aws/rds';
import { iam_role } from './templates/aws/iam_role';
import { alb } from './templates/aws/alb';
import { route53 } from './templates/aws/route53';
import { storage_bucket as gcpStorageBucket } from './templates/gcp/storage_bucket';
import { cloud_run as gcpCloudRun } from './templates/gcp/cloud_run';
import { storage_account as azureStorageAccount } from './templates/azure/storage_account';

// Resource types per provider
export const RESOURCES: Record<Provider, Array<{value: string, label: string}>> = {
  aws: [
    { value: 's3_bucket', label: 'S3 Bucket' },
    { value: 'instance', label: 'EC2 Instance' },
    { value: 'db_instance', label: 'RDS Database' },
    { value: 'iam_role', label: 'IAM Role' },
    { value: 'alb', label: 'Application Load Balancer' },
    { value: 'route53', label: 'Route53 Zone/Record' },
    { value: 'lambda_function', label: 'Lambda Function' },
    { value: 'cloudfront_distribution', label: 'CloudFront Distribution' },
    { value: 'vpc', label: 'VPC' },
    { value: 'subnet', label: 'Subnet' },
    { value: 'internet_gateway', label: 'Internet Gateway' },
    { value: 'route_table', label: 'Route Table' },
    { value: 'security_group', label: 'Security Group' },
    { value: 'iam_role', label: 'IAM Role' },
    { value: 'iam_policy', label: 'IAM Policy' },
  ],
  gcp: [
    { value: 'storage_bucket', label: 'Storage Bucket' },
    { value: 'cloud_run_service', label: 'Cloud Run Service' },
    { value: 'compute_instance', label: 'Compute Instance' },
  ],
  azure: [
    { value: 'storage_account', label: 'Storage Account' },
    { value: 'virtual_machine', label: 'Virtual Machine' },
  ],
};

// Templates mapping for renderers
const TEMPLATES: Record<Provider, Record<string, TemplateFns>> = {
      aws: {
        s3_bucket: s3 as unknown as TemplateFns,

        instance: ec2 as unknown as TemplateFns,

        db_instance: rds as unknown as TemplateFns,
        iam_role: iam_role as unknown as TemplateFns,
        alb: alb as unknown as TemplateFns,
        route53: route53 as unknown as TemplateFns,

        vpc: vpc as unknown as TemplateFns,

        subnet: subnetTpl as unknown as TemplateFns,

        security_group: securityGroup as unknown as TemplateFns,

        vpc_basic: vpc_basic as unknown as TemplateFns,
      },
      gcp: {
        storage_bucket: gcpStorageBucket as unknown as TemplateFns,
        cloud_run_service: gcpCloudRun as unknown as TemplateFns,
      },
      azure: {
        storage_account: azureStorageAccount as unknown as TemplateFns,
      },
    };

export function renderMainTf(inputs: TemplateInputs) {
  const { provider, resourceType } = inputs;
  // Prefer resource-specific template when available
  const tpl = TEMPLATES[provider]?.[resourceType];
  if (tpl) return tpl.main(inputs);

  // Fallback generic example
  return `# main.tf (provider=${provider})
# Resource: ${resourceType}

resource "${resourcePrefix(provider)}_${resourceType}" "this" {
  name = var.name
  # region = var.region
  # tags   = var.tags
}`;
}

export function renderVariablesTf(inputs: TemplateInputs) {
  const { provider, resourceType } = inputs;
  const tpl = TEMPLATES[provider]?.[resourceType];
  if (tpl) return tpl.variables(inputs);
  // Generic variables fallback
  const { name, region, tags = {} } = inputs;
  const tagLines = Object.entries(tags)
    .map(([k, v]) => `    ${k} = "${v}"`)
    .join('\n');
  return `variable "name" { type = string default = "${name}" }
variable "region" { type = string default = "${region ?? ''}" }
variable "tags" { type = map(string) default = {
${tagLines}
} }
`;
}

export function renderOutputsTf(inputs: TemplateInputs) {
  const { provider, resourceType } = inputs;
  const tpl = TEMPLATES[provider]?.[resourceType];
  if (tpl) return tpl.outputs(inputs);
  const type = `${resourcePrefix(provider)}_${resourceType}`;
  return `output "resource_id" { description = "The generated resource id" value = ${type}.this.id }
`;
}

export function renderTfvars(inputs: TemplateInputs) {
  const { provider, resourceType } = inputs;
  const tpl = TEMPLATES[provider]?.[resourceType];
  if (tpl) return tpl.tfvars(inputs);
  const { name, region, tags = {} } = inputs;
  const tagLines = Object.entries(tags)
    .map(([k, v]) => `  ${k} = "${v}"`)
    .join('\n');
  return `# terraform.tfvars
name   = "${name}"
region = "${region ?? ''}"
tags = {
${tagLines}
}
`;
}
