export type Provider = 'aws' | 'gcp' | 'azure';

export interface TemplateInputs {
  provider: Provider;
  resourceType: string;
  name: string;
  region?: string;
  tags?: Record<string, string>;
  options?: Record<string, boolean>;
}

export interface TemplateFns {
  main: (inputs: TemplateInputs) => string;
  variables: (inputs: TemplateInputs) => string;
  outputs: (inputs: TemplateInputs) => string;
  tfvars: (inputs: TemplateInputs) => string;
}
