FROM golang:1.20-alpine
WORKDIR /app
COPY go.mod go.sum ./
RUN apk add --no-cache git curl unzip && go mod download

# Install Terraform CLI (use a recent stable version)
ENV TERRAFORM_VERSION=1.5.7
RUN set -eux; \
	# determine architecture for Terraform (amd64 or arm64)
	tf_arch="amd64"; \
	case "$(apk --print-arch)" in \
	  x86_64) tf_arch=amd64 ;; \
	  aarch64) tf_arch=arm64 ;; \
	  *) tf_arch=amd64 ;; \
	esac; \
	echo "Downloading terraform ${TERRAFORM_VERSION} for linux_${tf_arch}"; \
	if curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${tf_arch}.zip" -o /tmp/terraform.zip; then \
		unzip /tmp/terraform.zip -d /usr/local/bin; \
		chmod +x /usr/local/bin/terraform; \
		rm /tmp/terraform.zip; \
		terraform version; \
		echo "Terraform installed successfully"; \
	else \
		echo "Warning: terraform ${TERRAFORM_VERSION} for linux_${tf_arch} not found; trying latest..."; \
		if curl -fsSL "https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_${tf_arch}.zip" -o /tmp/terraform.zip; then \
			unzip /tmp/terraform.zip -d /usr/local/bin; \
			chmod +x /usr/local/bin/terraform; \
			rm /tmp/terraform.zip; \
			terraform version; \
			echo "Terraform 1.5.0 installed successfully"; \
		else \
			echo "Warning: Could not download terraform binary; formatting will be skipped"; \
		fi; \
	fi

COPY . .
RUN go build -o /usr/local/bin/devformat-backend .
EXPOSE 8080
CMD ["/usr/local/bin/devformat-backend"]
