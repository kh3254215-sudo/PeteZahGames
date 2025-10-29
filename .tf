// PeteZahGames Terraform config for deploying to Google Cloud Run
// Expanded from placeholder. This provisions:
// - Google Cloud project + region
// - Artifact Registry for container images
// - Cloud Run service for the Express app
// - IAM bindings for public access
// - Environment variables for Supabase auth
// - Outputs for service URL

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# -------------------------
# Variables
# -------------------------
variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy into"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "petezahgames"
}

variable "supabase_url" {
  description = "Supabase project URL"
  type        = string
}

variable "supabase_key" {
  description = "Supabase anon/public key"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Session secret for Express sessions"
  type        = string
  sensitive   = true
}

# -------------------------
# Artifact Registry (for Docker images)
# -------------------------
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "${var.service_name}-repo"
  description   = "Artifact Registry for PeteZahGames app"
  format        = "DOCKER"
}

# -------------------------
# Cloud Run Service
# -------------------------
resource "google_cloud_run_service" "app" {
  name     = var.service_name
  location = var.region

  template {
    spec {
      containers {
        image = "${google_artifact_registry_repository.repo.repository_url}/${var.service_name}:latest"

        env {
          name  = "SUPABASE_URL"
          value = var.supabase_url
        }
        env {
          name  = "SUPABASE_KEY"
          value = var.supabase_key
        }
        env {
          name  = "SESSION_SECRET"
          value = var.session_secret
        }
        env {
          name  = "PORT"
          value = "3000"
        }
        ports {
          container_port = 3000
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

# -------------------------
# IAM Policy: allow public access
# -------------------------
resource "google_cloud_run_service_iam_member" "public" {
  location = google_cloud_run_service.app.location
  project  = var.project_id
  service  = google_cloud_run_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -------------------------
# Outputs
# -------------------------
output "service_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_service.app.status[0].url
}
