mod compare;
mod diff;
mod git;

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

// ---------------------------------------------------------------------------
// git 比較コマンド（SPEC.md §6.2 git比較、§6.3 git連携方式）
// 読み取り専用 git コマンドのみを実行する（git.rs 参照）。
// ---------------------------------------------------------------------------

/// 指定パスが git リポジトリか判定する
#[tauri::command]
async fn is_git_repository(path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || git::is_git_repository_impl(&path))
        .await
        .map_err(|e| format!("git 判定の実行に失敗しました: {e}"))
}

/// ブランチ一覧を GitBranch 列で返す
#[tauri::command]
async fn list_branches(repo: String) -> Result<Vec<git::GitBranch>, String> {
    tauri::async_runtime::spawn_blocking(move || git::list_branches_impl(&repo))
        .await
        .map_err(|e| format!("ブランチ一覧の取得に失敗しました: {e}"))?
}

/// 指定ブランチの最新コミット一覧（最大50件）を GitCommit 列で返す
#[tauri::command]
async fn list_commits(repo: String, branch: String) -> Result<Vec<git::GitCommit>, String> {
    tauri::async_runtime::spawn_blocking(move || git::list_commits_impl(&repo, &branch))
        .await
        .map_err(|e| format!("コミット一覧の取得に失敗しました: {e}"))?
}

/// 2つの ref（ref_a = old / ref_b = new）を比較し変更ファイルの FileNode ツリーを返す
#[tauri::command]
async fn compare_git_refs(
    repo: String,
    ref_a: String,
    ref_b: String,
) -> Result<Vec<compare::FileNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::compare_git_refs_impl(&repo, &ref_a, &ref_b)
    })
    .await
    .map_err(|e| format!("git 比較の実行に失敗しました: {e}"))?
}

/// `git show REF:PATH` で指定 ref のファイル内容を読み込む（1MB 上限）
#[tauri::command]
async fn read_file_at_ref(
    repo: String,
    git_ref: String,
    path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::read_file_at_ref_impl(&repo, &git_ref, &path)
    })
    .await
    .map_err(|e| format!("ファイル読み込みの実行に失敗しました: {e}"))?
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
            is_git_repository,
            list_branches,
            list_commits,
            compare_git_refs,
            read_file_at_ref,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
