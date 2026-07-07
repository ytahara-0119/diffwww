//! テキスト差分計算（SPEC.md §4.6, §6.1）
//!
//! Myers 差分アルゴリズム（`similar` クレート）で左右テキストを比較し、
//! WinMerge 流の4分類（added / deleted / modified / unchanged）の
//! `DiffLine[]` を返す。
//! - Equal   → unchanged
//! - Insert  → added
//! - Delete  → deleted
//! - Replace → 行数が重なる範囲は modified、余りは deleted / added

use serde::Serialize;
use similar::{capture_diff_slices, Algorithm, DiffOp};

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineType {
    Added,
    Deleted,
    Modified,
    Unchanged,
}

/// src/app/types.ts の DiffLine と serde camelCase で一致させる
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub line_type: DiffLineType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_line_number: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_line_number: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_content: Option<String>,
}

/// 左右テキストの Myers 差分を DiffLine 列に変換する
pub fn compute_diff_impl(left_text: &str, right_text: &str) -> Vec<DiffLine> {
    let left_lines: Vec<&str> = left_text.lines().collect();
    let right_lines: Vec<&str> = right_text.lines().collect();
    let ops = capture_diff_slices(Algorithm::Myers, &left_lines, &right_lines);

    let mut result = Vec::new();
    for op in ops {
        match op {
            DiffOp::Equal {
                old_index,
                new_index,
                len,
            } => {
                for i in 0..len {
                    result.push(DiffLine {
                        line_type: DiffLineType::Unchanged,
                        left_line_number: Some(old_index + i + 1),
                        right_line_number: Some(new_index + i + 1),
                        left_content: Some(left_lines[old_index + i].to_string()),
                        right_content: Some(right_lines[new_index + i].to_string()),
                    });
                }
            }
            DiffOp::Delete {
                old_index, old_len, ..
            } => {
                for i in 0..old_len {
                    result.push(deleted_line(&left_lines, old_index + i));
                }
            }
            DiffOp::Insert {
                new_index, new_len, ..
            } => {
                for i in 0..new_len {
                    result.push(added_line(&right_lines, new_index + i));
                }
            }
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                // 行数が重なる範囲は modified（左右同一行位置に表示）
                let paired = old_len.min(new_len);
                for i in 0..paired {
                    result.push(DiffLine {
                        line_type: DiffLineType::Modified,
                        left_line_number: Some(old_index + i + 1),
                        right_line_number: Some(new_index + i + 1),
                        left_content: Some(left_lines[old_index + i].to_string()),
                        right_content: Some(right_lines[new_index + i].to_string()),
                    });
                }
                // 余りは deleted / added
                for i in paired..old_len {
                    result.push(deleted_line(&left_lines, old_index + i));
                }
                for i in paired..new_len {
                    result.push(added_line(&right_lines, new_index + i));
                }
            }
        }
    }
    result
}

fn deleted_line(left_lines: &[&str], index: usize) -> DiffLine {
    DiffLine {
        line_type: DiffLineType::Deleted,
        left_line_number: Some(index + 1),
        right_line_number: None,
        left_content: Some(left_lines[index].to_string()),
        right_content: None,
    }
}

fn added_line(right_lines: &[&str], index: usize) -> DiffLine {
    DiffLine {
        line_type: DiffLineType::Added,
        left_line_number: None,
        right_line_number: Some(index + 1),
        left_content: None,
        right_content: Some(right_lines[index].to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_maps_to_modified() {
        let lines = compute_diff_impl("a\nb\nc\n", "a\nB\nc\n");
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].line_type, DiffLineType::Unchanged);
        assert_eq!(lines[1].line_type, DiffLineType::Modified);
        assert_eq!(lines[1].left_line_number, Some(2));
        assert_eq!(lines[1].right_line_number, Some(2));
        assert_eq!(lines[1].left_content.as_deref(), Some("b"));
        assert_eq!(lines[1].right_content.as_deref(), Some("B"));
        assert_eq!(lines[2].line_type, DiffLineType::Unchanged);
    }

    #[test]
    fn insert_maps_to_added_with_placeholder_side() {
        let lines = compute_diff_impl("a\n", "a\nnew\n");
        assert_eq!(lines[1].line_type, DiffLineType::Added);
        assert_eq!(lines[1].left_line_number, None);
        assert_eq!(lines[1].left_content, None); // 左はプレースホルダ行
        assert_eq!(lines[1].right_line_number, Some(2));
        assert_eq!(lines[1].right_content.as_deref(), Some("new"));
    }

    #[test]
    fn delete_maps_to_deleted_with_placeholder_side() {
        let lines = compute_diff_impl("a\nold\n", "a\n");
        assert_eq!(lines[1].line_type, DiffLineType::Deleted);
        assert_eq!(lines[1].left_line_number, Some(2));
        assert_eq!(lines[1].left_content.as_deref(), Some("old"));
        assert_eq!(lines[1].right_line_number, None);
        assert_eq!(lines[1].right_content, None); // 右はプレースホルダ行
    }

    #[test]
    fn whole_file_added_when_left_empty() {
        let lines = compute_diff_impl("", "x\ny\n");
        assert_eq!(lines.len(), 2);
        assert!(lines.iter().all(|l| l.line_type == DiffLineType::Added));
    }

    #[test]
    fn replace_with_extra_lines_splits_into_modified_and_added() {
        // 左1行 → 右3行の Replace：1行 modified + 2行 added
        let lines = compute_diff_impl("a\nx\nz\n", "a\np\nq\nr\nz\n");
        let modified: Vec<_> = lines
            .iter()
            .filter(|l| l.line_type == DiffLineType::Modified)
            .collect();
        let added: Vec<_> = lines
            .iter()
            .filter(|l| l.line_type == DiffLineType::Added)
            .collect();
        assert_eq!(modified.len(), 1);
        assert_eq!(added.len(), 2);
    }

    #[test]
    fn serializes_to_camel_case_matching_types_ts() {
        let lines = compute_diff_impl("a\n", "b\n");
        let json = serde_json::to_value(&lines[0]).unwrap();
        assert_eq!(json["type"], "modified");
        assert!(json.get("leftLineNumber").is_some());
        assert!(json.get("rightLineNumber").is_some());
        assert!(json.get("leftContent").is_some());
        assert!(json.get("rightContent").is_some());
    }
}
