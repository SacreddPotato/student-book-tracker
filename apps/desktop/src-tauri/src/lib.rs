use std::{fs::create_dir_all, time::Duration};

use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteConnection},
    Connection, Executor,
};
use tauri::Manager;

const LOCAL_DATABASE_FILE: &str = "student-book-tracker.db";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalSqlStatement {
    query: String,
    values: Vec<JsonValue>,
}

#[tauri::command]
async fn execute_local_transaction(
    app: tauri::AppHandle,
    statements: Vec<LocalSqlStatement>,
) -> Result<(), String> {
    let app_config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    create_dir_all(&app_config_dir).map_err(|error| error.to_string())?;

    let options = SqliteConnectOptions::new()
        .filename(app_config_dir.join(LOCAL_DATABASE_FILE))
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
        .expect("error while running tauri application");
}
