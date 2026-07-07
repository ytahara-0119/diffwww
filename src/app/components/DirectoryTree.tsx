import { useMemo, useState } from 'react';
import { Binary, ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import type { CompareStatus, FileNode } from '../types';

// ---------------------------------------------------------------------------
// DirectoryTree（SPEC.md §4.5）
// 比較結果ツリー（FileNode[]）を表示する左ペイン。
// フォルダ比較・git比較の両モードで共通利用する（入力は FileNode[] のみ）。
// ---------------------------------------------------------------------------

interface DirectoryTreeProps {
  nodes: FileNode[];
  selectedPath?: string;
  onSelect: (node: FileNode) => void;
}

// ステータス別カラー（左ボーダー2px + 低透過背景。Figma Make の statusClass 準拠）
const statusClass: Record<CompareStatus, string> = {
  added: 'border-l-emerald-500 bg-emerald-500/10',
  deleted: 'border-l-rose-500 bg-rose-500/10',
  modified: 'border-l-amber-500 bg-amber-500/10',
  identical: 'border-l-zinc-600 bg-zinc-500/5',
};

const statusTextClass: Record<CompareStatus, string> = {
  added: 'text-emerald-300',
  deleted: 'text-rose-300',
  modified: 'text-amber-300',
  identical: 'text-muted-foreground',
};

function countFiles(nodes: FileNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'file') {
      count += 1;
    } else if (node.children) {
      count += countFiles(node.children);
    }
  }
  return count;
}

interface TreeNodeRowProps {
  node: FileNode;
  depth: number;
  selectedPath?: string;
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (node: FileNode) => void;
}

function TreeNodeRow({
  node,
  depth,
  selectedPath,
  collapsedPaths,
  onToggle,
  onSelect,
}: TreeNodeRowProps) {
  const isDirectory = node.type === 'directory';
  const isOpen = isDirectory && !collapsedPaths.has(node.path);
  const isSelected = !isDirectory && node.path === selectedPath;

  const rowClass = isSelected
    ? 'border-l-primary bg-primary/15 text-primary'
    : `${statusClass[node.status]} ${statusTextClass[node.status]}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => (isDirectory ? onToggle(node.path) : onSelect(node))}
        title={node.path}
        aria-expanded={isDirectory ? isOpen : undefined}
        aria-current={isSelected ? 'true' : undefined}
        className={`flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 border-l-2 pr-2 text-left text-xs transition-colors hover:bg-accent ${rowClass}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {isDirectory ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )
        ) : node.isText === false ? (
          <Binary className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate font-mono">{node.name}</span>
      </button>
      {isDirectory && isOpen && node.children && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              collapsedPaths={collapsedPaths}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function DirectoryTree({ nodes, selectedPath, onSelect }: DirectoryTreeProps) {
  // 閉じているディレクトリの path 集合（初期状態は全ディレクトリ展開）
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const fileCount = useMemo(() => countFiles(nodes), [nodes]);

  const handleToggle = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {/* ペイン上部バー */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-foreground">ファイルツリー</span>
        <span className="font-mono text-xs text-muted-foreground">
          {`${fileCount} files`}
        </span>
      </div>

      {/* ツリー本体 */}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {nodes.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            比較結果がありません
          </p>
        ) : (
          <ul>
            {nodes.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                collapsedPaths={collapsedPaths}
                onToggle={handleToggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DirectoryTree;
