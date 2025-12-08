resource "google_cloud_run_service" "app" {
  name     = var.service_name
  location = var.region

  template {
    spec {
      containers {
        image = "${google_artifact_registry_repository.repo.repository_url}/${var.service_name}:latest"

        # Session secret from Secret Manager
        env {
          name = "SESSION_SECRET"
          value_from_secret {
            secret_name = google_secret_manager_secret.session_secret.secret_id
            version     = "latest"
          }
        }

        # Admin + Bot config
        env {
          name  = "ADMIN_EMAIL"
          value = var.admin_email
        }
        env {
          name  = "BOT_TOKEN"
          value = var.bot_token
        }

        # Cloud SQL (Postgres)
        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.db.connection_name
        }
        env {
          name  = "DB_USER"
          value = google_sql_user.app_user.name
        }
        env {
          name  = "DB_PASS"
          value = random_password.db_password.result
        }
        env {
          name  = "DB_NAME"
          value = google_sql_database.app_db.name
        }

        # SQLite3 fallback (non-cloud)
        # For local dev, you can override with: DB_SQLITE_PATH=/app/db.sqlite3
        env {
          name  = "DB_SQLITE_PATH"
          value = "/app/db.sqlite3"
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
