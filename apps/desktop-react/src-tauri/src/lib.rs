use std::{fs::create_dir_all, time::Duration};

use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteConnection},
    Connection, Executor,
};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalSqlStatement {
    query: String,
    values: Vec<JsonValue>,
}

fn validate_database_file(database_file: &str) -> Result<&str, String> {
    match database_file {
        "student-book-tracker-react.db" | "student-book-tracker.db" => Ok(database_file),
        _ => Err("Unsupported local database file".to_owned()),
    }
}

#[tauri::command]
async fn execute_local_transaction(
    app: tauri::AppHandle,
    database_file: String,
    statements: Vec<LocalSqlStatement>,
) -> Result<(), String> {
    let database_file = validate_database_file(&database_file)?;
    let app_config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    create_dir_all(&app_config_dir).map_err(|error| error.to_string())?;

    let options = SqliteConnectOptions::new()
        .filename(app_config_dir.join(database_file))
        .create_if_missing(true)
        .busy_timeout(Duration::from_secs(5));
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = connection.begin().await.map_err(|error| error.to_string())?;

    for statement in statements {
        let mut query = sqlx::query(&statement.query);
        for value in statement.values {
            if value.is_null() {
                query = query.bind(None::<JsonValue>);
            } else if let Some(value) = value.as_str() {
                query = query.bind(value.to_owned());
            } else if let Some(value) = value.as_number() {
                query = query.bind(value.as_f64().unwrap_or_default());
            } else {
                query = query.bind(value);
            }
        }

        transaction
            .execute(query)
            .await
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().await.map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![execute_local_transaction])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[cfg(test)]
mod tests {
    use super::validate_database_file;

    #[test]
    fn accepts_only_preview_and_production_database_files() {
        assert!(validate_database_file("student-book-tracker-react.db").is_ok());
        assert!(validate_database_file("student-book-tracker.db").is_ok());
        assert!(validate_database_file("other.db").is_err());
    }
}
