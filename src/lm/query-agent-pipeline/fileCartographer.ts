import * as vscode from 'vscode';
import { FolderNode, ChunkInfo } from '../../types';
import { workspaceRelativePath } from '../../utils/path';
import { FileDescriptor, FileInventoryDraft } from './types';

export interface FileCartographerOptions {
  codeExtensions?: string[];
}

export class FileCartographer {
  constructor(private readonly options: FileCartographerOptions = {}) {}

  async build(folder: FolderNode, chunks: ChunkInfo[]): Promise<FileInventoryDraft> {
    const files: FileDescriptor[] = [];
    for (const file of folder.files) {
      const relative = workspaceRelativePath(file);
      const stat = await vscode.workspace.fs.stat(file);
      files.push({
        path: relative,
        size: stat.size,
        isCode: this.isCodeFile(file)
      });
    }

    return {
      files,
      chunks
    };
  }

  private isCodeFile(uri: vscode.Uri): boolean {
    const ext = (uri.path.split('.').pop() || '').toLowerCase();
    const codeExtensions = this.options.codeExtensions ?? ['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'cs', 'swift', 'kt'];
    return codeExtensions.includes(ext);
  }
}
