import { TemplateFns, TemplateInputs } from '../../templateTypes';

export const storage_account: TemplateFns = {
  main: () => `resource "azurerm_storage_account" "this" {
      name                     = var.name
      resource_group_name      = var.resource_group_name
      location                 = var.region
      account_tier             = var.account_tier
      account_replication_type = var.account_replication_type
      tags                     = var.tags
    }`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `    ${k} = "${v}"`)
      .join('\n');
    return `variable "name" {
  description = "Storage account name (3-24 chars, globally unique)"
  type        = string
  default     = "${name}"
}

variable "region" {
  description = "Azure region (e.g., eastus)"
  type        = string
  default     = "${region ?? ''}"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
  default     = "rg-example"
}

variable "account_tier" {
  description = "Performance tier (Standard/Premium)"
  type        = string
  default     = "Standard"
}

variable "account_replication_type" {
  description = "Replication type (LRS, GRS, RAGRS, ZRS)"
  type        = string
  default     = "LRS"
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

  outputs: () => `output "storage_account_id" { value = azurerm_storage_account.this.id }
    `,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `name = "${name}"
    region = "${region ?? ''}"
    resource_group_name = "rg-example"
    account_tier = "Standard"
    account_replication_type = "LRS"
    tags = {
    ${tagLines}
    }
    `;
  },
};
