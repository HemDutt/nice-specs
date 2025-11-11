import * as vscode from 'vscode';
import { ChildSummary, FolderNode } from '../types';
import { docFileForFolder, relativeLink } from '../utils/path';
import { readFileText } from '../utils/fs';

const CHILD_SECTIONS = ['Purpose', 'Responsibilities', 'Dependencies', 'Operational Notes'];

export class DocChunker {
  async loadChildSummaries(folder: FolderNode): Promise<ChildSummary[]> {
    const summaries: ChildSummary[] = [];
    const parentDoc = docFileForFolder(folder.uri);

    for (const child of folder.children) {
      const docFile = docFileForFolder(child.uri);
      try {
        const markdown = await readFileText(docFile);
        const sections = extractSections(markdown);
        const synopsis = [sections['Purpose'], sections['Responsibilities']].filter(Boolean).join('\n\n');
        summaries.push({
          componentId: child.name,
          docPath: docFile,
          synopsis,
          relativeLink: relativeLink(parentDoc, docFile),
          sections
        });
      } catch {
        // Child doc might not exist yet.
      }
    }

    return summaries;
  }

}

function extractSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const section of CHILD_SECTIONS) {
    const pattern = new RegExp(`## ${section}[\\r\\n]+([\\s\\S]*?)(?:\\n## |$)`, 'i');
    const match = markdown.match(pattern);
    sections[section] = match ? match[1].trim() : '_Not documented_';
  }
  return sections;
}
