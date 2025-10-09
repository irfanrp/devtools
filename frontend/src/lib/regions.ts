import type { Provider } from './terraformTemplates';

export const REGIONS: Record<Provider, string[]> = {
  aws: [
    'us-east-1','us-east-2','us-west-1','us-west-2','af-south-1',
    'ap-east-1','ap-south-1','ap-northeast-1','ap-northeast-2','ap-northeast-3',
    'ap-southeast-1','ap-southeast-2','ap-southeast-3','ca-central-1','cn-north-1',
    'cn-northwest-1','eu-central-1','eu-west-1','eu-west-2','eu-west-3',
    'eu-north-1','eu-south-1','me-south-1','sa-east-1','us-gov-east-1','us-gov-west-1'
  ],
  gcp: [
    'asia-east1','asia-east2','asia-northeast1','asia-northeast2','asia-northeast3',
    'asia-south1','asia-southeast1','asia-southeast2','australia-southeast1',
    'europe-central2','europe-north1','europe-west1','europe-west2','europe-west3',
    'europe-west4','europe-west6','northamerica-northeast1','southamerica-east1',
    'us-central1','us-east1','us-east4','us-west1','us-west2','us-west3'
  ],
  azure: [
    'eastus','eastus2','centralus','northcentralus','southcentralus','westus','westus2',
    'westcentralus','canadacentral','canadaeast','brazilsouth','northeurope','westeurope',
    'uksouth','ukwest','francecentral','francesouth','germanywestcentral','norwayeast',
    'norwaysouth','swedencentral','swedensouth','switzerlandnorth','switzerlandwest',
    'australiaeast','australiasoutheast','southeastasia','eastasia','japaneast','japanwest'
  ]
};
