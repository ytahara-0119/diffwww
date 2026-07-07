mod compare;
mod diff;

use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Tauri IPC コマンド（SPEC.md §6.2 フォルダ比較 + 共通）
// すべて async コマンドとし、重い処理は spawn_blocking で実行して UI をブロックしない。
// ---------------------------------------------------------------------------

/// 左右ディレクトリを再帰比較し FileNode ツリーを返す
#[tauri::command]
async fn compare_directories(
    left: String,
    right: String,
) -> Result<Vec<compare::FileNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        compare::compare_directories_impl(Path::new(&left), Path::new(&right))
    })
    .await
    .map_err(|e| format!("比較処理の実行に失敗しました: {e}"))?
}

/// テキストファイルを読み込む（1MB 上限）
#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || compare::read_file_content_impl(Path::new(&path)))
        .await
        .map_err(|e| format!("ファイル読み込みの実行に失敗しました: {e}"))?
}

/// 左右テキストを Myers 差分計算し DiffLine 列を返す
#[tauri::command]
async fn compute_diff(
    left_text: String,
    right_text: String,
) -> Result<Vec<diff::DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || diff::compute_diff_impl(&left_text, &right_text))
        .await
        .map_err(|e| format!("差分計算の実行に失敗しました: {e}"))
}

/// バイナリ詳細ビュー用に左右のサイズ・SHA-256・更新日時を返す（SPEC.md §4.6）
#[tauri::command]
async fn read_binary_meta(
    left: Option<String>,
    right: Option<String>,
) -> Result<compare::BinaryMeta, String> {
    tauri::async_runtime::spawn_blocking(move || {
        compare::read_binary_meta_impl(
            left.as_deref().map(Path::new),
            right.as_deref().map(Path::new),
        )
    })
    .await
    .map_err(|e| format!("メタデータ取得の実行に失敗しました: {e}"))
}

/// OS ネイティブのフォルダ選択ダイアログを開く
#[tauri::command]
async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("フォルダ選択ダイアログの表示に失敗しました: {e}"))?;

    Ok(picked
        .and_then(|file_path| file_path.into_path().ok())
        .map(|path: PathBuf| path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(640.0_f64, 500.0_f64)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            compare_directories,
            read_file_content,
            compute_diff,
            read_binary_meta,
            open_folder_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
