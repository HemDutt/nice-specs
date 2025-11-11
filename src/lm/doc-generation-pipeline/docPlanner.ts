import * as vscode from 'vscode';
import { ChildSummary, DocPlan, FolderNode } from '../../types';
import { workspaceRelativePath } from '../../utils/path';
import { PersonaClient, safeJsonParse } from '../personaClient';
import { truncate } from './promptUtils';

export class DocPlanner {
  constructor(private readonly persona: PersonaClient) {}

  async plan(folder: FolderNode, childSummaries: ChildSummary[], token: vscode.CancellationToken): Promise<DocPlan> {
    const fileList = folder.files.map((file) => `- ${workspaceRelativePath(file)}`).join('\n') || '- (none)';
    const childList =
      childSummaries
        .map(
          (child) =>
            `- ${child.componentId} (${child.relativeLink})\n  Purpose: ${truncate(child.sections['Purpose'])}\n  Responsibilities: ${truncate(
              child.sections['Responsibilities']
            )}`
        )
        .join('\n') || 'None';

    const prompt = `You are DocOrchestrator. Break the documentation work for ${workspaceRelativePath(folder.uri)} into ordered steps.
First think about objectives, then list steps referencing file names, then list risks/open questions. Return STRICT JSON:
{
  "objectives": [string],
  "steps": [string],
  "risks": [string]
}
Files in scope:
${fileList}
Child documentation buffers:
${childList}`;

    const response = await this.persona.invoke('DocOrchestrator', prompt, token, 'Plan documentation steps');
    return safeJsonParse<DocPlan>(response) ?? { objectives: ['Describe component'], steps: ['Summarize code', 'Reference children'], risks: [] };
  }
}
