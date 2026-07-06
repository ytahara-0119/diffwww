import type { FileNode, DiffLine, GitBranch, GitCommit } from '../types';

// ---------------------------------------------------------------------------
// フォルダ比較用モックツリー
// 2階層以上・全 CompareStatus（added / deleted / modified / identical）を網羅し、
// テキストファイルとバイナリファイルの両方を含む。
// Tauri IPC（issue06）で実データに差し替えるまで UI 先行開発に使用する。
// ---------------------------------------------------------------------------

export const mockDirectoryTree: FileNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'directory',
    status: 'modified',
    children: [
      {
        name: 'components',
        path: 'src/components',
        type: 'directory',
        status: 'modified',
        children: [
          {
            name: 'SplitDiffView.tsx',
            path: 'src/components/SplitDiffView.tsx',
            type: 'file',
            status: 'modified',
            size: 8412,
            modifiedDate: '2026-07-03T14:22:05Z',
            isText: true,
            leftContent: [
              "import { useRef, useEffect } from 'react';",
              "import type { DiffLine } from '../types';",
              'const SCROLL_SYNC_INTERVAL = 100;',
              'function legacyScrollHandler(pane: HTMLDivElement) {',
              '  pane.scrollLeft = 0;',
              '}',
              'export function SplitDiffView({ lines }: { lines: DiffLine[] }) {',
              '  return <div className="split-diff">{lines.length}</div>;',
              '}',
            ].join('\n'),
            rightContent: [
              "import { useRef, useEffect } from 'react';",
              "import type { DiffLine } from '../types';",
              'const SCROLL_SYNC_INTERVAL = 16;',
              'export function synchronizeHorizontalScroll(leftPane: HTMLDivElement, rightPane: HTMLDivElement, gutterWidth: number, options: ScrollSyncOptions = defaultScrollSyncOptions): void {',
              '  rightPane.scrollLeft = leftPane.scrollLeft;',
              '}',
              'export function SplitDiffView({ lines }: { lines: DiffLine[] }) {',
              '  return <div className="split-diff">{lines.length}</div>;',
              '}',
            ].join('\n'),
          },
          {
            name: 'GutterSync.tsx',
            path: 'src/components/GutterSync.tsx',
            type: 'file',
            status: 'added',
            size: 2310,
            modifiedDate: '2026-07-04T09:41:30Z',
            isText: true,
            rightContent: [
              "import { useLayoutEffect } from 'react';",
              '',
              'export function GutterSync({ target }: { target: HTMLElement | null }) {',
              '  useLayoutEffect(() => {',
              '    if (!target) return;',
              "    target.style.position = 'sticky';",
              '  }, [target]);',
              '  return null;',
              '}',
            ].join('\n'),
          },
          {
            name: 'LegacyScrollbar.tsx',
            path: 'src/components/LegacyScrollbar.tsx',
            type: 'file',
            status: 'deleted',
            size: 1874,
            modifiedDate: '2026-05-18T11:03:12Z',
            isText: true,
            leftContent: [
              'export function LegacyScrollbar() {',
              '  // 旧実装：水平スクロール非対応のため削除予定',
              '  return <div className="legacy-scrollbar" />;',
              '}',
            ].join('\n'),
          },
          {
            name: 'TreePane.tsx',
            path: 'src/components/TreePane.tsx',
            type: 'file',
            status: 'identical',
            size: 4096,
            modifiedDate: '2026-06-20T08:15:44Z',
            isText: true,
          },
        ],
      },
      {
        name: 'utils',
        path: 'src/utils',
        type: 'directory',
        status: 'modified',
        children: [
          {
            name: 'lineMetrics.ts',
            path: 'src/utils/lineMetrics.ts',
            type: 'file',
            status: 'modified',
            size: 1520,
            modifiedDate: '2026-07-02T17:55:09Z',
            isText: true,
            leftContent: 'export const LINE_HEIGHT = 18;\n',
            rightContent: 'export const LINE_HEIGHT = 20;\n',
          },
          {
            name: 'throttle.ts',
            path: 'src/utils/throttle.ts',
            type: 'file',
            status: 'identical',
            size: 640,
            modifiedDate: '2026-04-30T10:00:00Z',
            isText: true,
          },
        ],
      },
      {
        name: 'main.tsx',
        path: 'src/main.tsx',
        type: 'file',
        status: 'identical',
        size: 512,
        modifiedDate: '2026-04-28T13:30:21Z',
        isText: true,
      },
    ],
  },
  {
    name: 'assets',
    path: 'assets',
    type: 'directory',
    status: 'modified',
    children: [
      {
        name: 'app-icon.png',
        path: 'assets/app-icon.png',
        type: 'file',
        status: 'modified',
        size: 48213,
        modifiedDate: '2026-07-01T12:08:33Z',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        isText: false,
      },
      {
        name: 'splash.png',
        path: 'assets/splash.png',
        type: 'file',
        status: 'added',
        size: 132700,
        modifiedDate: '2026-07-05T16:47:02Z',
        hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
        isText: false,
      },
      {
        name: 'legacy-logo.png',
        path: 'assets/legacy-logo.png',
        type: 'file',
        status: 'deleted',
        size: 20480,
        modifiedDate: '2025-11-12T09:20:15Z',
        hash: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
        isText: false,
      },
    ],
  },
  {
    name: 'docs',
    path: 'docs',
    type: 'directory',
    status: 'identical',
    children: [
      {
        name: 'README.md',
        path: 'docs/README.md',
        type: 'file',
        status: 'identical',
        size: 2048,
        modifiedDate: '2026-03-14T07:12:58Z',
        isText: true,
      },
    ],
  },
  {
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    status: 'modified',
    size: 980,
    modifiedDate: '2026-07-04T18:02:47Z',
    isText: true,
    leftContent: '{\n  "name": "renderer",\n  "version": "0.1.0"\n}\n',
    rightContent: '{\n  "name": "renderer",\n  "version": "0.2.0"\n}\n',
  },
];

// ---------------------------------------------------------------------------
// git比較用モックツリー（main ↔ feature/split-scroll の変更ファイルのみ）
// SPEC.md §4.4 に従い identical は含めない。
// ---------------------------------------------------------------------------

export const mockGitTree: FileNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'directory',
    status: 'modified',
    children: [
      {
        name: 'components',
        path: 'src/components',
        type: 'directory',
        status: 'modified',
        children: [
          {
            name: 'SplitDiffView.tsx',
            path: 'src/components/SplitDiffView.tsx',
            type: 'file',
            status: 'modified',
            size: 8412,
            modifiedDate: '2026-07-03T14:22:05Z',
            isText: true,
          },
          {
            name: 'GutterSync.tsx',
            path: 'src/components/GutterSync.tsx',
            type: 'file',
            status: 'added',
            size: 2310,
            modifiedDate: '2026-07-04T09:41:30Z',
            isText: true,
          },
          {
            name: 'LegacyScrollbar.tsx',
            path: 'src/components/LegacyScrollbar.tsx',
            type: 'file',
            status: 'deleted',
            size: 1874,
            modifiedDate: '2026-05-18T11:03:12Z',
            isText: true,
          },
        ],
      },
      {
        name: 'utils',
        path: 'src/utils',
        type: 'directory',
        status: 'modified',
        children: [
          {
            name: 'lineMetrics.ts',
            path: 'src/utils/lineMetrics.ts',
            type: 'file',
            status: 'modified',
            size: 1520,
            modifiedDate: '2026-07-02T17:55:09Z',
            isText: true,
          },
        ],
      },
    ],
  },
  {
    name: 'assets',
    path: 'assets',
    type: 'directory',
    status: 'modified',
    children: [
      {
        name: 'app-icon.png',
        path: 'assets/app-icon.png',
        type: 'file',
        status: 'modified',
        size: 48213,
        modifiedDate: '2026-07-03T14:22:05Z',
        hash: '7f9c2ba4e88f827d616045507605853e',
        isText: false,
      },
    ],
  },
  {
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    status: 'modified',
    size: 980,
    modifiedDate: '2026-07-04T18:02:47Z',
    isText: true,
  },
];

// ---------------------------------------------------------------------------
// git比較用：ブランチ一覧・コミット一覧
// ---------------------------------------------------------------------------

export const mockBranches: GitBranch[] = [
  { name: 'main', isCurrent: true },
  { name: 'feature/split-scroll', isCurrent: false },
  { name: 'feature/binary-preview', isCurrent: false },
  { name: 'fix/scroll-jitter', isCurrent: false },
];

export const mockCommits: GitCommit[] = [
  {
    hash: '9b7a31c4f2e8d05a6b1c9e7f3d24a80b5c6d1e2f',
    shortHash: '9b7a31c',
    message: 'renderer: stabilize gutter sync',
    author: 'ytahara',
    date: '2026-07-04T09:41:30Z',
  },
  {
    hash: '4d2f8a1b9c0e7d6f5a4b3c2d1e0f9a8b7c6d5e4f',
    shortHash: '4d2f8a1',
    message: 'diff: map replace ops to modified lines',
    author: 'ytahara',
    date: '2026-07-03T14:22:05Z',
  },
  {
    hash: 'c1e5b7d3a9f2c4e6b8d0a1f3c5e7b9d2a4f6c8e0',
    shortHash: 'c1e5b7d',
    message: 'tree: collapse identical directories by default',
    author: 'ytahara',
    date: '2026-07-02T17:55:09Z',
  },
  {
    hash: 'a8f4c2e6b0d9a3f5c7e1b4d8a2f6c0e9b3d7a5f1',
    shortHash: 'a8f4c2e',
    message: 'ui: add sticky line-number gutter',
    author: 'ytahara',
    date: '2026-06-28T11:10:42Z',
  },
  {
    hash: 'f5d9b3a7c1e8f4d2b6a0c9e5f3d7b1a8c4e2f6d0',
    shortHash: 'f5d9b3a',
    message: 'chore: initial project scaffold',
    author: 'ytahara',
    date: '2026-06-20T08:15:44Z',
  },
];

// ---------------------------------------------------------------------------
// Split Diff 用 DiffLine[] サンプル
// - added / deleted / modified / unchanged の4種をすべて含む
// - added は leftContent が undefined、deleted は rightContent が undefined
//   （プレースホルダ行の描画確認用）
// - 水平スクロール検証用に 120 文字を超える長い行を含む
// ---------------------------------------------------------------------------

export const mockDiffLines: DiffLine[] = [
  {
    type: 'unchanged',
    leftLineNumber: 1,
    rightLineNumber: 1,
    leftContent: "import { useRef, useEffect } from 'react';",
    rightContent: "import { useRef, useEffect } from 'react';",
  },
  {
    type: 'unchanged',
    leftLineNumber: 2,
    rightLineNumber: 2,
    leftContent: "import type { DiffLine } from '../types';",
    rightContent: "import type { DiffLine } from '../types';",
  },
  {
    type: 'modified',
    leftLineNumber: 3,
    rightLineNumber: 3,
    leftContent: 'const SCROLL_SYNC_INTERVAL = 100;',
    rightContent: 'const SCROLL_SYNC_INTERVAL = 16;',
  },
  {
    type: 'deleted',
    leftLineNumber: 4,
    leftContent: 'function legacyScrollHandler(pane: HTMLDivElement) {',
    // rightContent は undefined（右カラムはプレースホルダ行）
  },
  {
    type: 'deleted',
    leftLineNumber: 5,
    leftContent: '  pane.scrollLeft = 0;',
  },
  {
    type: 'deleted',
    leftLineNumber: 6,
    leftContent: '}',
  },
  {
    type: 'added',
    rightLineNumber: 4,
    // leftContent は undefined（左カラムはプレースホルダ行）
    // 水平スクロール検証用の 120 文字超の長い行（約 180 文字）
    rightContent:
      'export function synchronizeHorizontalScroll(leftPane: HTMLDivElement, rightPane: HTMLDivElement, gutterWidth: number, options: ScrollSyncOptions = defaultScrollSyncOptions): void {',
  },
  {
    type: 'added',
    rightLineNumber: 5,
    rightContent: '  rightPane.scrollLeft = leftPane.scrollLeft;',
  },
  {
    type: 'added',
    rightLineNumber: 6,
    rightContent: '}',
  },
  {
    type: 'unchanged',
    leftLineNumber: 7,
    rightLineNumber: 7,
    leftContent: '',
    rightContent: '',
  },
  {
    type: 'unchanged',
    leftLineNumber: 8,
    rightLineNumber: 8,
    leftContent: 'export function SplitDiffView({ lines }: { lines: DiffLine[] }) {',
    rightContent: 'export function SplitDiffView({ lines }: { lines: DiffLine[] }) {',
  },
  {
    type: 'modified',
    leftLineNumber: 9,
    rightLineNumber: 9,
    leftContent: '  return <div className="split-diff">{lines.length}</div>;',
    rightContent: '  return <div className="split-diff" data-sync="on">{lines.length}</div>;',
  },
  {
    type: 'unchanged',
    leftLineNumber: 10,
    rightLineNumber: 10,
    leftContent: '}',
    rightContent: '}',
  },
];

// ---------------------------------------------------------------------------
// バイナリファイル比較用データ（BinaryFileView 用）
// 左右それぞれの size / hash / modifiedDate を保持する。
// ---------------------------------------------------------------------------

export const mockBinaryComparison = {
  fileName: 'app-icon.png',
  path: 'assets/app-icon.png',
  left: {
    size: 48213,
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    modifiedDate: '2026-06-15T10:30:00Z',
  },
  right: {
    size: 51876,
    hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    modifiedDate: '2026-07-01T12:08:33Z',
  },
};
