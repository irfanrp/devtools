import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const cloud_run: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "google_cloud_run_service" "this" {
  name     = var.name
  location = var.region

  template {
    spec {
      containers {
        image = var.image
        ports {
          container_port = var.port
        }
        env = var.env
      }
    }
  }

  traffics {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
  labels = var.tags
}
`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {}, options = {} } = inputs as any;
    const labelLines = Object.entries(tags)
      .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      .join('\n');
    const labelBlock = Object.keys(tags).length ? `{
${labelLines}
}` : "{}";

    const envLines = (options.env || []).map(([k, v]: any) => `  { name = ${JSON.stringify(k)} value = ${JSON.stringify(v)} }`).join('\n');
    const envBlock = (options.env && options.env.length) ? `[
${envLines}
]` : '[]';

    return `variable "name" {
  description = "Cloud Run service name"
  type        = string
  default     = "${name}-svc"
}

variable "region" {
  description = "GCP region for Cloud Run (e.g. us-central1)"
  type        = string
  default     = "${region ?? ''}"
}

variable "image" {
  description = "Container image to deploy (gcr.io/... or docker.io/...)"
  type        = string
  default     = "gcr.io/cloudrun/hello"
}

variable "port" {
  description = "Container port exposed by the service"
  type        = number
  default     = 8080
}

variable "env" {
  description = "List of environment variable objects for the container"
  type        = list(map(string))
  default     = ${envBlock}
}

variable "tags" {
  description = "Resource labels"
  type        = map(string)
  default     = ${labelBlock}
}
`;
  },

  outputs: () => `output "service_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_service.this.status[0].url
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_service.this.name
}

output "service_location" {
  description = "Region/location of the service"
  value       = google_cloud_run_service.this.location
}
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {}, options = {} } = inputs as any;
    const labelLines = Object.entries(tags)
      .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      .join('\n');
    const labelBlock = Object.keys(tags).length ? `{
${labelLines}
}` : "{}";

    const envPairs = (options.env || []).map(([k, v]: any) => `  { name = ${JSON.stringify(k)} value = ${JSON.stringify(v)} }`).join('\n');
    const envBlock = (options.env && options.env.length) ? `[
${envPairs}
]` : '[]';

    return `name = "${name}-svc"
region = "${region ?? ''}"
image = "gcr.io/cloudrun/hello"
port = 8080
env = ${envBlock}

tags = ${labelBlock}
`;
  },
};
