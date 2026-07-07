//! ディレクトリ比較エンジン（SPEC.md §6.1〜6.2, §6.5）
//!
//! 段階比較アルゴリズム：
//! 1. パス存在比較（片側のみ → added / deleted）
//! 2. サイズ比較（不一致 → modified）
//! 3. SHA-256 ハッシュ比較（一致 → identical / 不一致 → modified）
//! 4. テキスト判定（先頭バイトの NUL 有無）
//!
//! `.git` / `node_modules` / `target` は自動スキップ。
//! アクセス不可のファイル・ディレクトリはスキップしてログ出力する（クラッシュ禁止）。

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::SystemTime;

/// 再帰走査時に自動スキップするディレクトリ名（SPEC.md §6.5）
const SKIP_DIRS: [&str; 3] = [".git", "node_modules", "target"];

/// テキストファイルの読み込み上限：1 MB（SPEC.md §6.1）
pub const MAX_TEXT_FILE_SIZE: u64 = 1024 * 1024;

/// テキスト判定で調べる先頭バイト数
const TEXT_PROBE_SIZE: usize = 8192;

// ---------------------------------------------------------------------------
// 型定義（src/app/types.ts と serde camelCase で一致させる）
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum CompareStatus {
    Added,
    Deleted,
    Modified,
    Identical,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    File,
    Directory,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_text: Option<bool>,
}

/// バイナリ詳細ビュー用の片側メタデータ（SPEC.md §4.6）
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BinarySideMeta {
    pub size: u64,
    pub hash: String,
    pub modified_date: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BinaryMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<BinarySideMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<BinarySideMeta>,
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/// 左右ディレクトリを再帰比較し FileNode ツリーを返す
pub fn compare_directories_impl(left: &Path, right: &Path) -> Result<Vec<FileNode>, String> {
    if !left.is_dir() {
        return Err(format!(
            "左フォルダが見つかりません: {}",
            left.display()
        ));
    }
    if !right.is_dir() {
        return Err(format!(
            "右フォルダが見つかりません: {}",
            right.display()
        ));
    }
    Ok(compare_dir_pair(Some(left), Some(right), ""))
}

/// テキストファイルを読み込む（1MB 上限、SPEC.md §6.1）
pub fn read_file_content_impl(path: &Path) -> Result<String, String> {
    let meta = fs::metadata(path)
        .map_err(|e| format!("ファイルを読み込めません: {} ({e})", path.display()))?;
    if meta.len() > MAX_TEXT_FILE_SIZE {
        return Err(format!(
            "ファイルサイズが 1 MB を超えているため表示できません: {}（{:.1} MB）",
            path.display(),
            meta.len() as f64 / (1024.0 * 1024.0)
        ));
    }
    let bytes = fs::read(path)
        .map_err(|e| format!("ファイルを読み込めません: {} ({e})", path.display()))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// バイナリ詳細ビュー用に左右のサイズ・SHA-256・更新日時を取得する
pub fn read_binary_meta_impl(left: Option<&Path>, right: Option<&Path>) -> BinaryMeta {
    BinaryMeta {
        left: left.and_then(binary_side_meta),
        right: right.and_then(binary_side_meta),
    }
}

// ---------------------------------------------------------------------------
// 内部実装
// ---------------------------------------------------------------------------

fn binary_side_meta(path: &Path) -> Option<BinarySideMeta> {
    let meta = fs::metadata(path)
        .map_err(|e| eprintln!("[diffwww] メタデータ取得に失敗しスキップ: {} ({e})", path.display()))
        .ok()?;
    let hash = hash_file(path)
        .map_err(|e| eprintln!("[diffwww] ハッシュ計算に失敗しスキップ: {} ({e})", path.display()))
        .ok()?;
    Some(BinarySideMeta {
        size: meta.len(),
        hash,
        modified_date: format_modified(&meta),
    })
}

/// ディレクトリ直下のエントリ一覧（名前 → ディレクトリか否か）。
/// シンボリックリンクとスキップ対象ディレクトリは除外。読み取り不可なら空を返す。
fn list_entries(dir: Option<&Path>) -> BTreeMap<String, bool> {
    let mut map = BTreeMap::new();
    let Some(dir) = dir else {
        return map;
    };
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("[diffwww] ディレクトリを読み取れずスキップ: {} ({e})", dir.display());
            return map;
        }
    };
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        // シンボリックリンクは循環参照防止のためスキップ
        let Ok(meta) = entry.path().symlink_metadata() else {
            eprintln!(
                "[diffwww] メタデータ取得に失敗しスキップ: {}",
                entry.path().display()
            );
            continue;
        };
        if meta.is_symlink() {
            continue;
        }
        let is_dir = meta.is_dir();
        if is_dir && SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        map.insert(name, is_dir);
    }
    map
}

/// 左右ディレクトリ（どちらかが None の場合あり）を比較して子ノード一覧を返す
fn compare_dir_pair(left: Option<&Path>, right: Option<&Path>, rel: &str) -> Vec<FileNode> {
    let left_entries = list_entries(left);
    let right_entries = list_entries(right);

    let mut names: Vec<&String> = left_entries.keys().collect();
    for name in right_entries.keys() {
        if !left_entries.contains_key(name) {
            names.push(name);
        }
    }
    // ディレクトリ優先 + 名前順
    names.sort_by(|a, b| {
        let a_dir = *left_entries.get(*a).or_else(|| right_entries.get(*a)).unwrap_or(&false);
        let b_dir = *left_entries.get(*b).or_else(|| right_entries.get(*b)).unwrap_or(&false);
        b_dir.cmp(&a_dir).then_with(|| a.cmp(b))
    });

    let mut nodes = Vec::new();
    for name in names {
        let in_left = left_entries.get(name).copied();
        let in_right = right_entries.get(name).copied();
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        let left_child = left.map(|p| p.join(name));
        let right_child = right.map(|p| p.join(name));

        let node = match (in_left, in_right) {
            // 両側ディレクトリ
            (Some(true), Some(true)) => Some(make_dir_node(
                name,
                &child_rel,
                left_child.as_deref(),
                right_child.as_deref(),
                None,
            )),
            // 片側のみディレクトリ
            (Some(true), None) => Some(make_dir_node(
                name,
                &child_rel,
                left_child.as_deref(),
                None,
                Some(CompareStatus::Deleted),
            )),
            (None, Some(true)) => Some(make_dir_node(
                name,
                &child_rel,
                None,
                right_child.as_deref(),
                Some(CompareStatus::Added),
            )),
            // 両側ファイル
            (Some(false), Some(false)) => compare_file_pair(
                name,
                &child_rel,
                left_child.as_deref().unwrap(),
                right_child.as_deref().unwrap(),
            ),
            // 片側のみファイル
            (Some(false), None) => make_single_file_node(
                name,
                &child_rel,
                left_child.as_deref().unwrap(),
                CompareStatus::Deleted,
            ),
            (None, Some(false)) => make_single_file_node(
                name,
                &child_rel,
                right_child.as_deref().unwrap(),
                CompareStatus::Added,
            ),
            // 型不一致（片側ファイル・片側ディレクトリ）：変更扱いのファイルノードにする
            (Some(true), Some(false)) | (Some(false), Some(true)) => {
                let file_side = if in_left == Some(false) {
                    left_child.as_deref().unwrap()
                } else {
                    right_child.as_deref().unwrap()
                };
                make_single_file_node(name, &child_rel, file_side, CompareStatus::Modified)
            }
            (None, None) => None,
        };
        if let Some(node) = node {
            nodes.push(node);
        }
    }
    nodes
}

/// ディレクトリノードを作る。status 未指定時は子から導出（全子 identical → identical）
fn make_dir_node(
    name: &str,
    rel: &str,
    left: Option<&Path>,
    right: Option<&Path>,
    forced_status: Option<CompareStatus>,
) -> FileNode {
    let children = compare_dir_pair(left, right, rel);
    let status = forced_status.unwrap_or_else(|| {
        if children
            .iter()
            .all(|c| c.status == CompareStatus::Identical)
        {
            CompareStatus::Identical
        } else {
            CompareStatus::Modified
        }
    });
    FileNode {
        name: name.to_string(),
        path: rel.to_string(),
        node_type: NodeType::Directory,
        status,
        children: Some(children),
        size: None,
        modified_date: None,
        hash: None,
        is_text: None,
    }
}

/// 両側に存在するファイルの段階比較（サイズ → SHA-256）
fn compare_file_pair(name: &str, rel: &str, left: &Path, right: &Path) -> Option<FileNode> {
    let left_meta = fs::metadata(left)
        .map_err(|e| eprintln!("[diffwww] アクセス不可のためスキップ: {} ({e})", left.display()))
        .ok()?;
    let right_meta = fs::metadata(right)
        .map_err(|e| eprintln!("[diffwww] アクセス不可のためスキップ: {} ({e})", right.display()))
        .ok()?;

    let (status, hash) = if left_meta.len() != right_meta.len() {
        (CompareStatus::Modified, None)
    } else {
        let left_hash = hash_file(left)
            .map_err(|e| eprintln!("[diffwww] ハッシュ計算に失敗しスキップ: {} ({e})", left.display()))
            .ok()?;
        let right_hash = hash_file(right)
            .map_err(|e| eprintln!("[diffwww] ハッシュ計算に失敗しスキップ: {} ({e})", right.display()))
            .ok()?;
        if left_hash == right_hash {
            (CompareStatus::Identical, Some(right_hash))
        } else {
            (CompareStatus::Modified, Some(right_hash))
        }
    };

    // 両側ともテキストの場合のみ Split Diff 対象にする
    let is_text = is_text_file(left) && is_text_file(right);

    Some(FileNode {
        name: name.to_string(),
        path: rel.to_string(),
        node_type: NodeType::File,
        status,
        children: None,
        size: Some(right_meta.len()),
        modified_date: Some(format_modified(&right_meta)),
        hash,
        is_text: Some(is_text),
    })
}

/// 片側のみに存在するファイルのノードを作る
fn make_single_file_node(
    name: &str,
    rel: &str,
    path: &Path,
    status: CompareStatus,
) -> Option<FileNode> {
    let meta = fs::metadata(path)
        .map_err(|e| eprintln!("[diffwww] アクセス不可のためスキップ: {} ({e})", path.display()))
        .ok()?;
    Some(FileNode {
        name: name.to_string(),
        path: rel.to_string(),
        node_type: NodeType::File,
        status,
        children: None,
        size: Some(meta.len()),
        modified_date: Some(format_modified(&meta)),
        hash: None,
        is_text: Some(is_text_file(path)),
    })
}

/// SHA-256 をストリーム処理で計算する（大容量ファイル対応、SPEC.md §6.1）
fn hash_file(path: &Path) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// テキスト判定：先頭バイトに NUL を含まなければテキスト（簡易判定）
fn is_text_file(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut buf = [0u8; TEXT_PROBE_SIZE];
    let Ok(n) = file.read(&mut buf) else {
        return false;
    };
    !buf[..n].contains(&0)
}

/// 最終更新日時を ISO 8601 文字列にする
fn format_modified(meta: &fs::Metadata) -> String {
    let time = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    chrono::DateTime::<chrono::Local>::from(time).to_rfc3339()
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// テスト用の一意な一時ディレクトリを作る
    fn temp_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "diffwww-test-issue06-{tag}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn write(path: &Path, content: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn find<'a>(nodes: &'a [FileNode], path: &str) -> Option<&'a FileNode> {
        for node in nodes {
            if node.path == path {
                return Some(node);
            }
            if let Some(children) = &node.children {
                if let Some(found) = find(children, path) {
                    return Some(found);
                }
            }
        }
        None
    }

    #[test]
    fn stage_comparison_detects_four_statuses() {
        let root = temp_root("statuses");
        let left = root.join("left");
        let right = root.join("right");

        write(&left.join("same.txt"), b"hello\nworld\n");
        write(&right.join("same.txt"), b"hello\nworld\n");
        write(&left.join("changed.txt"), b"line1\nline2\n");
        write(&right.join("changed.txt"), b"line1\nLINE2\n"); // 同サイズ・内容違い
        write(&left.join("removed.txt"), b"gone\n");
        write(&right.join("new.txt"), b"fresh\n");
        write(&left.join("sub/nested.txt"), b"a\n");
        write(&right.join("sub/nested.txt"), b"a\nb\n"); // サイズ違い

        let tree = compare_directories_impl(&left, &right).unwrap();

        assert_eq!(find(&tree, "same.txt").unwrap().status, CompareStatus::Identical);
        assert_eq!(find(&tree, "changed.txt").unwrap().status, CompareStatus::Modified);
        assert_eq!(find(&tree, "removed.txt").unwrap().status, CompareStatus::Deleted);
        assert_eq!(find(&tree, "new.txt").unwrap().status, CompareStatus::Added);
        assert_eq!(find(&tree, "sub/nested.txt").unwrap().status, CompareStatus::Modified);

        // ディレクトリノードのステータスは子から導出される
        let sub = find(&tree, "sub").unwrap();
        assert_eq!(sub.node_type, NodeType::Directory);
        assert_eq!(sub.status, CompareStatus::Modified);

        // identical ファイルにはハッシュが設定される
        assert!(find(&tree, "same.txt").unwrap().hash.is_some());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn skips_git_node_modules_target() {
        let root = temp_root("skip");
        let left = root.join("left");
        let right = root.join("right");

        write(&left.join(".git/config"), b"x");
        write(&left.join("node_modules/pkg/index.js"), b"x");
        write(&right.join("target/debug/bin"), b"x");
        write(&left.join("keep.txt"), b"x");
        write(&right.join("keep.txt"), b"x");

        let tree = compare_directories_impl(&left, &right).unwrap();

        assert!(find(&tree, ".git").is_none());
        assert!(find(&tree, "node_modules").is_none());
        assert!(find(&tree, "target").is_none());
        assert!(find(&tree, "keep.txt").is_some());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn detects_binary_files() {
        let root = temp_root("binary");
        let left = root.join("left");
        let right = root.join("right");

        write(&left.join("app.bin"), &[0x00, 0x01, 0x02, 0xff]);
        write(&right.join("app.bin"), &[0x00, 0x01, 0x02, 0xfe]);
        write(&left.join("plain.txt"), b"text\n");
        write(&right.join("plain.txt"), b"text\n");

        let tree = compare_directories_impl(&left, &right).unwrap();

        assert_eq!(find(&tree, "app.bin").unwrap().is_text, Some(false));
        assert_eq!(find(&tree, "app.bin").unwrap().status, CompareStatus::Modified);
        assert_eq!(find(&tree, "plain.txt").unwrap().is_text, Some(true));

        // バイナリメタデータ取得（両側）
        let meta = read_binary_meta_impl(
            Some(&left.join("app.bin")),
            Some(&right.join("app.bin")),
        );
        let l = meta.left.unwrap();
        let r = meta.right.unwrap();
        assert_eq!(l.size, 4);
        assert_eq!(r.size, 4);
        assert_ne!(l.hash, r.hash);
        assert_eq!(l.hash.len(), 64); // SHA-256 hex

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn read_file_content_enforces_1mb_limit() {
        let root = temp_root("limit");
        let big = root.join("big.txt");
        let small = root.join("small.txt");
        write(&big, &vec![b'a'; (MAX_TEXT_FILE_SIZE + 1) as usize]);
        write(&small, b"ok\n");

        let err = read_file_content_impl(&big).unwrap_err();
        assert!(err.contains("1 MB"));
        assert_eq!(read_file_content_impl(&small).unwrap(), "ok\n");

        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn skips_inaccessible_files_without_crash() {
        use std::os::unix::fs::PermissionsExt;

        let root = temp_root("noaccess");
        let left = root.join("left");
        let right = root.join("right");

        write(&left.join("locked.txt"), b"secret\n");
        write(&right.join("locked.txt"), b"secret\n");
        write(&left.join("open.txt"), b"x\n");
        write(&right.join("open.txt"), b"x\n");

        // 読み取り権限を剥奪（同サイズなのでハッシュ計算が走り、失敗してスキップされる）
        fs::set_permissions(&left.join("locked.txt"), fs::Permissions::from_mode(0o000)).unwrap();

        let tree = compare_directories_impl(&left, &right).unwrap();
        assert!(find(&tree, "locked.txt").is_none());
        assert!(find(&tree, "open.txt").is_some());

        fs::set_permissions(&left.join("locked.txt"), fs::Permissions::from_mode(0o644)).unwrap();
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn errors_on_missing_directory() {
        let root = temp_root("missing");
        let left = root.join("left");
        fs::create_dir_all(&left).unwrap();
        let err = compare_directories_impl(&left, &root.join("nope")).unwrap_err();
        assert!(err.contains("右フォルダ"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn serializes_to_camel_case_matching_types_ts() {
        let node = FileNode {
            name: "a.txt".into(),
            path: "a.txt".into(),
            node_type: NodeType::File,
            status: CompareStatus::Modified,
            children: None,
            size: Some(10),
            modified_date: Some("2026-01-01T00:00:00+09:00".into()),
            hash: Some("abc".into()),
            is_text: Some(true),
        };
        let json = serde_json::to_value(&node).unwrap();
        assert_eq!(json["type"], "file");
        assert_eq!(json["status"], "modified");
        assert!(json.get("modifiedDate").is_some());
        assert!(json.get("isText").is_some());
        assert!(json.get("children").is_none());
    }
}
