import * as vscode from 'vscode';
import { ChildSummary, FolderNode } from '../../types';
import { componentIdFromUri, workspaceRelativePath } from '../../utils/path';
import { PersonaClient, safeJsonParse } from '../personaClient';
import { ScopeProfile } from './types';

interface ScopeSummaryResponse {
  summary: string;
  tags?: string[];
}

export class ScopeScanner {
  constructor(private readonly persona: PersonaClient, private readonly workspaceRoot: vscode.Uri) {}

  async scan(folder: FolderNode, childSummaries: ChildSummary[], token: vscode.CancellationToken): Promise<ScopeProfile> {
    const componentId = componentIdFromUri(folder.uri, this.workspaceRoot);
    const folderPath = workspaceRelativePath(folder.uri, this.workspaceRoot);
    const parents = folderPath.includes('/') ? [componentId.split('.').slice(0, -1).join('.')].filter(Boolean) : [];
    const children = childSummaries.map((child) => child.componentId);
    const childContext =
      childSummaries
        .map(
          (child) =>
            `- ${child.componentId}\n  Purpose: ${truncate(child.sections?.Purpose)}\n  Responsibilities: ${truncate(child.sections?.Responsibilities)}`
        )
        .join('\n') || 'None';

    const fileCount = folder.files.length;
    const prompt = `You are DocOrchestrator. Summarize the component located at ${folderPath || '(workspace root)'}.
Provide 2-3 sentences that capture:
1. What this folder owns.
2. How it interacts with adjacent systems or child components.
Return STRICT JSON: { "summary": string, "tags": [string] }

Child context:
${childContext}

Number of files: ${fileCount}`;

    const response = await this.persona.invoke('DocOrchestrator', prompt, token, 'Summarize component scope');
    const parsed = safeJsonParse<ScopeSummaryResponse>(response);
    const summary =
      parsed?.summary?.trim() ||
      `The ${folder.name} component (${folderPath || 'root'}) encapsulates ${fileCount} files and coordinates with ${children.length} child components.`;

    return {
      componentId,
      folderPath,
      parents,
      children,
      summary,
      tags: parsed?.tags ?? [],
      folder
    };
  }
}

function truncate(value?: string, length = 120): string {
  if (!value) {
    return '';
  }
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
