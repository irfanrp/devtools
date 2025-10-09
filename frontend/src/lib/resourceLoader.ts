export type ResourceItem = { value: string; label: string };
export type Provider = 'aws' | 'gcp' | 'azure';

// Large resource lists centralized here. Keeping them separate allows async loading
// when the dropdown opens or provider changes.
const RESOURCES_FULL: Record<Provider, ResourceItem[]> = {
  aws: [
    { value: 's3_bucket', label: 'S3 Bucket' },
    { value: 'instance', label: 'EC2 Instance' },
    { value: 'db_instance', label: 'RDS Database' },
    { value: 'lambda_function', label: 'Lambda Function' },
    { value: 'cloudfront_distribution', label: 'CloudFront Distribution' },
    { value: 'vpc', label: 'VPC' },
  ],
  gcp: [
    { value: 'storage_bucket', label: 'Cloud Storage Bucket' },
    { value: 'compute_instance', label: 'Compute Engine Instance' },
    { value: 'sql_database_instance', label: 'Cloud SQL Database Instance' },
    { value: 'cloudfunctions_function', label: 'Cloud Functions (Gen1) Function' },
    { value: 'dns_managed_zone', label: 'Cloud DNS Managed Zone' },
    { value: 'pubsub_topic', label: 'Pub/Sub Topic' },
    { value: 'pubsub_subscription', label: 'Pub/Sub Subscription' },
    { value: 'artifact_registry_repository', label: 'Artifact Registry Repository' },
    { value: 'compute_firewall', label: 'VPC Firewall Rule' },
    { value: 'compute_network', label: 'VPC Network' },
  ],
  azure: [
    { value: 'storage_account', label: 'Storage Account' },
    { value: 'linux_virtual_machine', label: 'Linux Virtual Machine' },
    { value: 'sql_database', label: 'SQL Database' },
    { value: 'function_app', label: 'Function App' },
    { value: 'cdn_profile', label: 'CDN Profile' },
    { value: 'resource_group', label: 'Resource Group' },
    { value: 'virtual_network', label: 'Virtual Network' },
    { value: 'subnet', label: 'Subnet' },
    { value: 'public_ip', label: 'Public IP' },
    { value: 'network_security_group', label: 'Network Security Group' },
    { value: 'key_vault', label: 'Key Vault' },
    { value: 'container_registry', label: 'Container Registry (ACR)' },
  ],
};

// Simulate async fetch to allow large lists or remote loading later.
export function getResources(provider: Provider, simulateDelayMs = 0): Promise<ResourceItem[]> {
  return new Promise((resolve) => {
    if (simulateDelayMs > 0) {
      setTimeout(() => resolve(RESOURCES_FULL[provider]), simulateDelayMs);
    } else {
      resolve(RESOURCES_FULL[provider]);
    }
  });
}

export const SMALL_PREVIEW: Record<Provider, ResourceItem[]> = {
  aws: RESOURCES_FULL.aws.slice(0, 6),
  gcp: RESOURCES_FULL.gcp.slice(0, 5),
  azure: RESOURCES_FULL.azure.slice(0, 5),
};

export default RESOURCES_FULL;
