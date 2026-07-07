//! git 比較エンジン（SPEC.md §4.3〜4.4, §6.2〜6.3）
//!
//! システム `git` CLI を `std::process::Command` で実行する（git2 クレートは不使用）。
//! - 使用コマンドは**読み取り専用のみ**：`diff` / `show` / `branch` / `log` / `rev-parse`
//! - 必ず `git -C <repoPath>` 形式で実行し、カレントディレクトリに依存しない
//! - 出力の解析は機械可読フォーマット（`--name-status -z` の NUL 区切り、
//!   `--format` の単位区切り文字 `\x1f`）を使い、空白・日本語ファイル名でも安全
//! - コマンド失敗時は stderr を含むエラーメッセージを返す（クラッシュしない）

use crate::compare::{CompareStatus, FileNode, NodeType, MAX_TEXT_FILE_SIZE};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::process::Command;

/// コミット一覧の取得上限（SPEC.md §6.1）
const MAX_COMMITS: usize = 50;

/// `--format` 出力のフィールド区切り文字（Unit Separator）
const FIELD_SEP: char = '\u{1f}';

// ---------------------------------------------------------------------------
// 型定義（src/app/types.ts と serde camelCase で一致させる）
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

// ---------------------------------------------------------------------------
// git CLI 実行ヘルパー
// ---------------------------------------------------------------------------

/// `git -C <repo> <args...>` を実行し stdout を返す。
/// 失敗時は stderr を含むエラーメッセージを返す（SPEC.md §6.3）。
fn run_git(repo: &str, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("git コマンドを実行できません: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "git {} が失敗しました: {}",
            args.first().copied().unwrap_or(""),
            stderr.trim()
        ));
    }
    Ok(output.stdout)
}

/// ref・ブランチ名の簡易バリデーション（空文字とオプション形式を拒否する）
fn validate_ref(git_ref: &str) -> Result<(), String> {
    let r = git_ref.trim();
    if r.is_empty() {
        return Err("ref が指定されていません".to_string());
    }
    if r.starts_with('-') {
        return Err(format!("不正な ref です: {r}"));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/// 指定パスが git リポジトリ（work tree 内）か判定する
pub fn is_git_repository_impl(path: &str) -> bool {
    let Ok(out) = run_git(path, &["rev-parse", "--is-inside-work-tree"]) else {
        return false;
    };
    String::from_utf8_lossy(&out).trim() == "true"
}

/// ブランチ一覧を返す。空リポジトリではブランチ0個の空 Vec を返す。
/// detached HEAD 時に `git branch` が出力する `(HEAD detached at ...)` 行は除外する。
pub fn list_branches_impl(repo: &str) -> Result<Vec<GitBranch>, String> {
    let format = format!("--format=%(refname:short){FIELD_SEP}%(HEAD)");
    let out = run_git(repo, &["branch", &format])?;
    let text = String::from_utf8_lossy(&out);
    let mut branches = Vec::new();
    for line in text.lines() {
        let mut fields = line.split(FIELD_SEP);
        let name = fields.next().unwrap_or("").trim().to_string();
        let head = fields.next().unwrap_or("").trim();
        // detached HEAD の擬似エントリや空行はスキップ
        if name.is_empty() || name.starts_with('(') {
            continue;
        }
        branches.push(GitBranch {
            name,
            is_current: head == "*",
        });
    }
    Ok(branches)
}

/// 指定ブランチの最新コミット一覧（最大50件）を返す
pub fn list_commits_impl(repo: &str, branch: &str) -> Result<Vec<GitCommit>, String> {
    validate_ref(branch)?;
    let max = format!("--max-count={MAX_COMMITS}");
    let format = format!(
        "--format=%H{FIELD_SEP}%h{FIELD_SEP}%s{FIELD_SEP}%an{FIELD_SEP}%cI"
    );
    let out = run_git(repo, &["log", branch.trim(), &max, &format, "--"])?;
    let text = String::from_utf8_lossy(&out);
    let mut commits = Vec::new();
    for line in text.lines() {
        let fields: Vec<&str> = line.split(FIELD_SEP).collect();
        if fields.len() < 5 {
            continue;
        }
        commits.push(GitCommit {
            hash: fields[0].to_string(),
            short_hash: fields[1].to_string(),
            message: fields[2].to_string(),
            author: fields[3].to_string(),
            date: fields[4].to_string(),
        });
    }
    Ok(commits)
}

/// 2つの ref を比較し、変更ファイルのみの FileNode ツリーを返す。
/// ref_a = 比較元（old / 左）、ref_b = 比較先（new / 右）（SPEC.md §4.3）。
/// identical はツリーに含めない（SPEC.md §4.4）。
pub fn compare_git_refs_impl(
    repo: &str,
    ref_a: &str,
    ref_b: &str,
) -> Result<Vec<FileNode>, String> {
    validate_ref(ref_a)?;
    validate_ref(ref_b)?;
    let (ref_a, ref_b) = (ref_a.trim(), ref_b.trim());

    // 変更ファイル一覧（NUL 区切り。R は D+A のペア、C は A として扱う）
    let out = run_git(repo, &["diff", "--name-status", "-z", ref_a, ref_b, "--"])?;
    let entries = parse_name_status(&String::from_utf8_lossy(&out))?;

    // バイナリ判定（--numstat はバイナリファイルの行数を "-" と出力する）
    let out = run_git(repo, &["diff", "--numstat", "-z", ref_a, ref_b, "--"])?;
    let binary_paths = parse_binary_paths(&String::from_utf8_lossy(&out));

    // フラットな変更一覧をツリーに変換する
    let mut root = DirBuilder::default();
    for (path, status) in entries {
        let is_text = !binary_paths.contains(&path);
        // バイナリの blob ハッシュ（BinaryFileView 用、取得できる範囲のベストエフォート）
        let hash = if is_text {
            None
        } else {
            let side_ref = match status {
                CompareStatus::Deleted => ref_a,
                _ => ref_b,
            };
            blob_hash(repo, side_ref, &path)
        };
        root.insert(&path, status, is_text, hash);
    }
    Ok(root.into_nodes(""))
}

/// `git show REF:PATH` で指定 ref のファイル内容を読み込む（1MB 上限、SPEC.md §6.1）
pub fn read_file_at_ref_impl(repo: &str, git_ref: &str, path: &str) -> Result<String, String> {
    validate_ref(git_ref)?;
    if path.trim().is_empty() {
        return Err("ファイルパスが指定されていません".to_string());
    }
    let spec = format!("{}:{}", git_ref.trim(), path);
    let out = run_git(repo, &["show", &spec])?;
    if out.len() as u64 > MAX_TEXT_FILE_SIZE {
        return Err(format!(
            "ファイルサイズが 1 MB を超えているため表示できません: {path}（{:.1} MB）",
            out.len() as f64 / (1024.0 * 1024.0)
        ));
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}

// ---------------------------------------------------------------------------
// 内部実装
// ---------------------------------------------------------------------------

/// `git diff --name-status -z` の出力を (相対パス, ステータス) の一覧に変換する。
/// トークン列は `STATUS NUL path NUL` の繰り返し（R / C のみ path が2つ続く）。
fn parse_name_status(out: &str) -> Result<Vec<(String, CompareStatus)>, String> {
    let mut result = Vec::new();
    let mut tokens = out.split('\0').filter(|s| !s.is_empty());
    while let Some(status_token) = tokens.next() {
        let kind = status_token.chars().next().unwrap_or('?');
        let mut next_path = || -> Result<String, String> {
            tokens
                .next()
                .map(str::to_string)
                .ok_or_else(|| "git diff --name-status の出力を解析できません".to_string())
        };
        match kind {
            'A' => result.push((next_path()?, CompareStatus::Added)),
            'D' => result.push((next_path()?, CompareStatus::Deleted)),
            // T（型変更）・U（未マージ）も変更として扱う
            'M' | 'T' | 'U' => result.push((next_path()?, CompareStatus::Modified)),
            // R（リネーム）：旧パス削除 + 新パス追加のペアに分解する
            'R' => {
                let old = next_path()?;
                let new = next_path()?;
                result.push((old, CompareStatus::Deleted));
                result.push((new, CompareStatus::Added));
            }
            // C（コピー）：コピー先を追加として扱う（コピー元は変更なし）
            'C' => {
                let _old = next_path()?;
                result.push((next_path()?, CompareStatus::Added));
            }
            // 未知のステータスはパス1つを読み捨ててスキップ
            _ => {
                let _ = next_path();
            }
        }
    }
    Ok(result)
}

/// `git diff --numstat -z` の出力からバイナリファイルの相対パス集合を作る。
/// 通常：`added TAB removed TAB path NUL`。
/// リネーム/コピー：`added TAB removed TAB NUL old NUL new NUL`。
/// バイナリファイルは added / removed が `-` になる。
fn parse_binary_paths(out: &str) -> HashSet<String> {
    let mut set = HashSet::new();
    let mut tokens = out.split('\0');
    while let Some(token) = tokens.next() {
        if token.is_empty() {
            continue;
        }
        let mut parts = token.splitn(3, '\t');
        let added = parts.next().unwrap_or("");
        let Some(_removed) = parts.next() else {
            continue; // タブを含まないトークンは numstat ヘッダではない
        };
        let is_binary = added == "-";
        match parts.next() {
            // path が空 → リネーム/コピー形式：続く2トークンが old / new
            Some("") | None => {
                let old = tokens.next();
                let new = tokens.next();
                if is_binary {
                    if let Some(p) = old {
                        set.insert(p.to_string());
                    }
                    if let Some(p) = new {
                        set.insert(p.to_string());
                    }
                }
            }
            Some(path) => {
                if is_binary {
                    set.insert(path.to_string());
                }
            }
        }
    }
    set
}

/// `git rev-parse REF:PATH` で blob ハッシュを取得する（失敗時は None）
fn blob_hash(repo: &str, git_ref: &str, path: &str) -> Option<String> {
    let out = run_git(repo, &["rev-parse", &format!("{git_ref}:{path}")]).ok()?;
    let hash = String::from_utf8_lossy(&out).trim().to_string();
    if hash.is_empty() {
        None
    } else {
        Some(hash)
    }
}

/// フラットな変更ファイル一覧を FileNode ツリーへ組み立てる中間構造。
/// BTreeMap により名前順が保証され、変換時にディレクトリ優先で並べる。
#[derive(Default)]
struct DirBuilder {
    dirs: BTreeMap<String, DirBuilder>,
    files: BTreeMap<String, FileLeaf>,
}

struct FileLeaf {
    status: CompareStatus,
    is_text: bool,
    hash: Option<String>,
}

impl DirBuilder {
    fn insert(&mut self, path: &str, status: CompareStatus, is_text: bool, hash: Option<String>) {
        let mut node = self;
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let Some((file_name, dir_parts)) = parts.split_last() else {
            return;
        };
        for part in dir_parts {
            node = node.dirs.entry(part.to_string()).or_default();
        }
        node.files.insert(
            file_name.to_string(),
            FileLeaf {
                status,
                is_text,
                hash,
            },
        );
    }

    /// ディレクトリ優先 + 名前順で FileNode 列に変換する。
    /// ディレクトリのステータスは子から導出する（全子が同一ステータスならそれ、混在なら modified）。
    fn into_nodes(self, prefix: &str) -> Vec<FileNode> {
        let mut nodes = Vec::new();
        for (name, dir) in self.dirs {
            let path = join_path(prefix, &name);
            let children = dir.into_nodes(&path);
            let status = derive_dir_status(&children);
            nodes.push(FileNode {
                name,
                path,
                node_type: NodeType::Directory,
                status,
                children: Some(children),
                size: None,
                modified_date: None,
                hash: None,
                is_text: None,
            });
        }
        for (name, leaf) in self.files {
            let path = join_path(prefix, &name);
            nodes.push(FileNode {
                name,
                path,
                node_type: NodeType::File,
                status: leaf.status,
                children: None,
                size: None,
                modified_date: None,
                hash: leaf.hash,
                is_text: Some(leaf.is_text),
            });
        }
        nodes
    }
}

fn join_path(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        name.to_string()
    } else {
        format!("{prefix}/{name}")
    }
}

fn derive_dir_status(children: &[FileNode]) -> CompareStatus {
    let mut statuses = children.iter().map(|c| c.status);
    let Some(first) = statuses.next() else {
        return CompareStatus::Modified;
    };
    if statuses.all(|s| s == first) {
        first
    } else {
        CompareStatus::Modified
    }
}

// ---------------------------------------------------------------------------
// テスト（一時ディレクトリに git init したテスト用リポジトリで検証する。
// 開発リポジトリ自体は比較対象にしない。checkout / commit 等の書き込みコマンドは
// テスト用リポジトリの準備のみに使用し、実装コードには存在しない）
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    /// テスト準備用の git 実行（実装の run_git とは別。書き込みコマンドを含む）
    fn git_setup(repo: &Path, args: &[&str]) {
        let status = Command::new("git")
            .arg("-C")
            .arg(repo)
            .args([
                "-c",
                "user.name=diffwww-test",
                "-c",
                "user.email=test@example.com",
            ])
            .args(args)
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed");
    }

    fn temp_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "diffwww-test-issue07-{tag}-{}",
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

    /// main / feature の2ブランチを持つテスト用リポジトリを作る。
    /// feature には 変更・追加（空白/日本語ファイル名）・削除・リネーム・バイナリ変更 を含む。
    fn setup_repo(tag: &str) -> PathBuf {
        let root = temp_root(tag);
        let repo = root.join("repo");
        fs::create_dir_all(&repo).unwrap();
        git_setup(&repo, &["init", "-b", "main"]);

        write(&repo.join("a.txt"), b"hello\nworld\n");
        write(&repo.join("removed.txt"), b"to be removed\n");
        write(
            &repo.join("docs/old name.txt"),
            b"rename me but keep this content identical\n",
        );
        write(&repo.join("assets/bin.dat"), &[0x00, 0x01, 0x02, 0xff]);
        git_setup(&repo, &["add", "-A"]);
        git_setup(&repo, &["commit", "-m", "first"]);

        git_setup(&repo, &["checkout", "-b", "feature"]);
        write(&repo.join("a.txt"), b"hello\nWORLD\n");
        write(&repo.join("src dir/日本語 ファイル.txt"), "こんにちは\n".as_bytes());
        fs::remove_file(repo.join("removed.txt")).unwrap();
        fs::rename(
            repo.join("docs/old name.txt"),
            repo.join("docs/new name.txt"),
        )
        .unwrap();
        write(&repo.join("assets/bin.dat"), &[0x00, 0x01, 0x02, 0xfe]);
        git_setup(&repo, &["add", "-A"]);
        git_setup(&repo, &["commit", "-m", "second"]);

        repo
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

    fn count_files(nodes: &[FileNode]) -> usize {
        nodes
            .iter()
            .map(|n| match &n.children {
                Some(children) => count_files(children),
                None => 1,
            })
            .sum()
    }

    #[test]
    fn detects_git_repository() {
        let repo = setup_repo("isrepo");
        assert!(is_git_repository_impl(&repo.to_string_lossy()));

        let plain = temp_root("isrepo-plain");
        assert!(!is_git_repository_impl(&plain.to_string_lossy()));
        assert!(!is_git_repository_impl("/nonexistent/path/for/diffwww"));

        let _ = fs::remove_dir_all(repo.parent().unwrap());
        let _ = fs::remove_dir_all(&plain);
    }

    #[test]
    fn lists_branches_with_current_flag() {
        let repo = setup_repo("branches");
        let repo_s = repo.to_string_lossy();
        let branches = list_branches_impl(&repo_s).unwrap();
        let names: Vec<&str> = branches.iter().map(|b| b.name.as_str()).collect();
        assert!(names.contains(&"main"));
        assert!(names.contains(&"feature"));
        // setup_repo は feature を checkout した状態で終わる
        let current = branches.iter().find(|b| b.is_current).unwrap();
        assert_eq!(current.name, "feature");

        let _ = fs::remove_dir_all(repo.parent().unwrap());
    }

    #[test]
    fn lists_commits_per_branch() {
        let repo = setup_repo("commits");
        let repo_s = repo.to_string_lossy();

        let main_commits = list_commits_impl(&repo_s, "main").unwrap();
        assert_eq!(main_commits.len(), 1);
        assert_eq!(main_commits[0].message, "first");

        let feature_commits = list_commits_impl(&repo_s, "feature").unwrap();
        assert_eq!(feature_commits.len(), 2);
        assert_eq!(feature_commits[0].message, "second"); // 新しい順
        assert_eq!(feature_commits[0].author, "diffwww-test");
        assert_eq!(feature_commits[0].hash.len(), 40);
        assert!(feature_commits[0].hash.starts_with(&feature_commits[0].short_hash));
        assert!(feature_commits[0].date.contains('T')); // ISO 8601

        // 不正なブランチはエラー（クラッシュしない）
        assert!(list_commits_impl(&repo_s, "no-such-branch").is_err());
        assert!(list_commits_impl(&repo_s, "").is_err());
        assert!(list_commits_impl(&repo_s, "--all").is_err());

        let _ = fs::remove_dir_all(repo.parent().unwrap());
    }

    #[test]
    fn compares_refs_with_rename_and_binary() {
        let repo = setup_repo("compare");
        let repo_s = repo.to_string_lossy();

        // 左=main（old）/ 右=feature（new）：feature で追加したファイルが added になる
        let tree = compare_git_refs_impl(&repo_s, "main", "feature").unwrap();

        assert_eq!(
            find(&tree, "a.txt").unwrap().status,
            CompareStatus::Modified
        );
        assert_eq!(
            find(&tree, "removed.txt").unwrap().status,
            CompareStatus::Deleted
        );
        // 空白 + 日本語ファイル名の追加（-z パースの検証）
        let added = find(&tree, "src dir/日本語 ファイル.txt").unwrap();
        assert_eq!(added.status, CompareStatus::Added);
        assert_eq!(added.is_text, Some(true));
        // リネームは D + A のペアに分解される
        assert_eq!(
            find(&tree, "docs/old name.txt").unwrap().status,
            CompareStatus::Deleted
        );
        assert_eq!(
            find(&tree, "docs/new name.txt").unwrap().status,
            CompareStatus::Added
        );
        // バイナリ変更：is_text = false、blob ハッシュ付き
        let bin = find(&tree, "assets/bin.dat").unwrap();
        assert_eq!(bin.status, CompareStatus::Modified);
        assert_eq!(bin.is_text, Some(false));
        assert!(bin.hash.is_some());
        // identical はツリーに含めない（変更6件のみ）
        assert_eq!(count_files(&tree), 6);
        fn assert_no_identical(nodes: &[FileNode]) {
            for node in nodes {
                assert_ne!(node.status, CompareStatus::Identical);
                if let Some(children) = &node.children {
                    assert_no_identical(children);
                }
            }
        }
        assert_no_identical(&tree);
        // ディレクトリノードが構成される
        assert_eq!(
            find(&tree, "src dir").unwrap().node_type,
            NodeType::Directory
        );

        // 逆向き（左=feature / 右=main）では added / deleted が反転する
        let reversed = compare_git_refs_impl(&repo_s, "feature", "main").unwrap();
        assert_eq!(
            find(&reversed, "removed.txt").unwrap().status,
            CompareStatus::Added
        );
        assert_eq!(
            find(&reversed, "src dir/日本語 ファイル.txt").unwrap().status,
            CompareStatus::Deleted
        );

        // コミットハッシュ指定でも動作する
        let commits = list_commits_impl(&repo_s, "feature").unwrap();
        let tree_by_hash =
            compare_git_refs_impl(&repo_s, &commits[1].hash, &commits[0].hash).unwrap();
        assert_eq!(count_files(&tree_by_hash), 6);

        // 不正な ref は stderr を含むエラー
        let err = compare_git_refs_impl(&repo_s, "main", "no-such-ref").unwrap_err();
        assert!(err.contains("git diff が失敗しました"));

        let _ = fs::remove_dir_all(repo.parent().unwrap());
    }

    #[test]
    fn reads_file_at_ref() {
        let repo = setup_repo("show");
        let repo_s = repo.to_string_lossy();

        assert_eq!(
            read_file_at_ref_impl(&repo_s, "main", "a.txt").unwrap(),
            "hello\nworld\n"
        );
        assert_eq!(
            read_file_at_ref_impl(&repo_s, "feature", "a.txt").unwrap(),
            "hello\nWORLD\n"
        );
        assert_eq!(
            read_file_at_ref_impl(&repo_s, "feature", "src dir/日本語 ファイル.txt").unwrap(),
            "こんにちは\n"
        );
        // 存在しないパスはエラー（クラッシュしない）
        assert!(read_file_at_ref_impl(&repo_s, "main", "nope.txt").is_err());

        // 1MB 超はエラーメッセージ
        write(
            &repo.join("big.txt"),
            &vec![b'a'; (MAX_TEXT_FILE_SIZE + 1) as usize],
        );
        git_setup(&repo, &["add", "-A"]);
        git_setup(&repo, &["commit", "-m", "big file"]);
        let err = read_file_at_ref_impl(&repo_s, "feature", "big.txt").unwrap_err();
        assert!(err.contains("1 MB"));

        let _ = fs::remove_dir_all(repo.parent().unwrap());
    }

    #[test]
    fn handles_empty_repository_and_detached_head() {
        // 空リポジトリ（コミット0・ブランチ0）：is_git_repository は true、
        // list_branches は空、list_commits はエラー（パニックしない）
        let root = temp_root("empty");
        let repo = root.join("repo");
        fs::create_dir_all(&repo).unwrap();
        git_setup(&repo, &["init", "-b", "main"]);
        let repo_s = repo.to_string_lossy();

        assert!(is_git_repository_impl(&repo_s));
        assert_eq!(list_branches_impl(&repo_s).unwrap().len(), 0);
        assert!(list_commits_impl(&repo_s, "main").is_err());
        assert!(compare_git_refs_impl(&repo_s, "main", "main").is_err());
        let _ = fs::remove_dir_all(&root);

        // detached HEAD：擬似エントリを除いたブランチ一覧が返る
        let repo = setup_repo("detached");
        let repo_s = repo.to_string_lossy();
        let commits = list_commits_impl(&repo_s, "main").unwrap();
        git_setup(&repo, &["checkout", "--detach", &commits[0].hash]);
        let branches = list_branches_impl(&repo_s).unwrap();
        let names: Vec<&str> = branches.iter().map(|b| b.name.as_str()).collect();
        assert!(names.contains(&"main"));
        assert!(names.contains(&"feature"));
        assert!(names.iter().all(|n| !n.starts_with('(')));
        assert!(branches.iter().all(|b| !b.is_current));

        let _ = fs::remove_dir_all(repo.parent().unwrap());
    }

    #[test]
    fn serializes_to_camel_case_matching_types_ts() {
        let branch = GitBranch {
            name: "main".into(),
            is_current: true,
        };
        let json = serde_json::to_value(&branch).unwrap();
        assert_eq!(json["isCurrent"], true);

        let commit = GitCommit {
            hash: "a".repeat(40),
            short_hash: "aaaaaaa".into(),
            message: "msg".into(),
            author: "me".into(),
            date: "2026-01-01T00:00:00+09:00".into(),
        };
        let json = serde_json::to_value(&commit).unwrap();
        assert!(json.get("shortHash").is_some());
    }
}
