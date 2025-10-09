import { TemplateFns, TemplateInputs } from '../../templateTypes';

// Per-resource EC2 template helpers
export const ec2: TemplateFns = {
  main: (inputs: TemplateInputs) => `resource "aws_instance" "this" {
  ami               = var.ami
  instance_type     = var.instance_type
  subnet_id         = var.subnet_id != "" ? var.subnet_id : null
  vpc_security_group_ids = var.vpc_security_group_ids
  associate_public_ip_address = var.associate_public_ip
  key_name          = var.key_name != "" ? var.key_name : null
  iam_instance_profile = var.iam_instance_profile != "" ? var.iam_instance_profile : null
  user_data         = var.user_data
  root_block_device {
   volume_size      = var.root_volume_size
   volume_type      = var.root_volume_type
   delete_on_termination = true
}
  tags = merge(var.tags,
        { Name = var.name }
    )
}`,

  variables: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `    ${k} = "${v}"`)
      .join('\n');
    return `variable "name" {
  description = "Instance Name tag"
  type        = string
  default     = "${name}"
}

variable "region" {
  description = "AWS Region"
  type        = string
  default     = "${region ?? ''}"
}

variable "ami" {
  description = "AMI ID"
  type        = string
  default     = "ami-12345678"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {
${tagLines}
  }
}

variable "subnet_id" {
  type    = string
  default = ""
}

variable "vpc_security_group_ids" {
  type    = list(string)
  default = []
}

variable "key_name" {
  description = "Optional EC2 key pair name for SSH"
  type        = string
  default     = ""
}

variable "iam_instance_profile" {
  description = "Optional IAM instance profile name"
  type        = string
  default     = ""
}

variable "user_data" {
  description = "User data (cloud-init)"
  type        = string
  default     = ""
}

variable "associate_public_ip" {
  description = "Associate a public IP to the instance"
  type        = bool
  default     = true
}

variable "root_volume_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 8
}

variable "root_volume_type" {
  description = "Root EBS volume type"
  type        = string
  default     = "gp3"
}

`;
  },

  outputs: () => `output "instance_id" {
  description = "The EC2 instance ID"
  value       = aws_instance.this.id
}

output "public_ip" {
  description = "The public IP address of the instance"
  value       = aws_instance.this.public_ip
}
`,

  tfvars: (inputs: TemplateInputs) => {
    const { name, region, tags = {} } = inputs as any;
    const tagLines = Object.entries(tags)
      .map(([k, v]) => `  ${k} = "${v}"`)
      .join('\n');
    return `# terraform.tfvars for EC2 example
name               = "${name}"
region             = "${region ?? ''}"
ami                = "ami-12345678"
instance_type      = "t3.micro"

# Optional networking (provide if you want to attach to an existing network)
# subnet_id = "subnet-xxxxxxxx"
# vpc_security_group_ids = ["sg-xxxxxxxx"]

# Optional SSH / IAM
# key_name = "my-keypair"
# iam_instance_profile = "my-instance-profile"

# Optional cloud-init / user data
# user_data = <<EOF
# #!/bin/bash
# echo hello
# EOF

# Network/public IP behaviour
associate_public_ip = true

# Root EBS settings
root_volume_size = 8
root_volume_type = "gp3"

tags = {
${tagLines}
}
`;
  },
};
