import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const storage_bucket: TemplateFns = {
  main: () => `resource "google_storage_bucket" "this" {
      name          = var.name
      location      = var.region
      storage_class = var.storage_class
      force_destroy = var.force_destroy
      labels        = var.tags
    }`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const labelLines = Object.entries(tags)
      .map(([k, v]) => `    ${k} = "${v}"`)
      .join('\n');
    return `variable "name" {
  description = "GCP Storage bucket name (must be globally unique)"
  type        = string
  default     = "${name}"
}

variable "region" {
  description = "GCP region (e.g., us-central1, us-east1)"
  type        = string
  default     = "${region ?? ''}"
}

variable "storage_class" {
  description = "Storage class (STANDARD, NEARLINE, COLDLINE, ARCHIVE)"
  type        = string
  default     = "STANDARD"
}

variable "force_destroy" {
  description = "Delete objects when bucket is destroyed"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Resource labels for organization"
  type        = map(string)
  default     = {
${labelLines}
  }
}
    `;
  },

  outputs: () => `output "bucket_url" {
   value = google_storage_bucket.this.url
   description = "The URL of the storage bucket"
  }
    `,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const labelLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `name = "${name}"
    region = "${region ?? ''}"
    storage_class = "STANDARD"
    force_destroy = false
    tags = {
    ${labelLines}
    }
    `;
  },
};
