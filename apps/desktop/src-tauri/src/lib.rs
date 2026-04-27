#[tauri::command]
fn navigate_to_workspace(window: tauri::WebviewWindow, url: String) -> Result<(), String> {
    let parsed_url = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    match parsed_url.scheme() {
        "http" | "https" => window.navigate(parsed_url).map_err(|error| error.to_string()),
        scheme => Err(format!("unsupported URL scheme: {scheme}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![navigate_to_workspace])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
