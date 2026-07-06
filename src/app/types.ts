export type CompareStatus = 'added' | 'deleted' | 'modified' | 'identical';

export type CompareMode = 'directory' | 'git';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  status: CompareStatus;
  children?: FileNode[];
  size?: number;
  modifiedDate?: string;
  hash?: string;
  isText?: boolean;
  leftContent?: string;
  rightContent?: string;
}

export interface DiffLine {
  type: 'added' | 'deleted' | 'modified' | 'unchanged';
  leftLineNumber?: number;   // deleted / modified / unchanged で設定
  rightLineNumber?: number;  // added / modified / unchanged で設定
  leftContent?: string;      // added のとき undefined（プレースホルダ行）
  rightContent?: string;     // deleted のとき undefined（プレースホルダ行）
}

export interface GitBranch {
  name: string;        // 例: "main", "feature/xxx"
  isCurrent: boolean;
}

export interface GitCommit {
  hash: string;        // フルハッシュ
  shortHash: string;   // 先頭7桁
  message: string;     // 1行目のみ
  author: string;
  date: string;        // ISO 8601
}

// git比較の対象指定。ブランチ名またはコミットハッシュを指す
export interface GitRefSelection {
  branch: string;      // 選択中のブランチ名
  commit?: string;     // 未指定ならブランチの HEAD
}
