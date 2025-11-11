import { DocDraft } from '../types';

const REQUIRED_HEADERS = [
  '## Purpose',
  '## Responsibilities',
  '## Code Structure',
  '## Data Flow & Interactions',
  '## Dependencies',
  '## Child Components',
  '## Operational Notes',
  '## Risks & TODOs',
  '## Changelog'
];

export class DocEvaluator {
  validateDraft(draft: DocDraft): void {
    this.ensureFrontmatter(draft.markdown);
    this.ensureHeadersInOrder(draft.markdown);
    this.ensureChildLinks(draft.markdown);
  }

  private ensureFrontmatter(markdown: string): void {
    const match = markdown.match(/^---[\r\n]+([\s\S]+?)\n---/);
    if (!match) {
      throw new Error('Documentation is missing YAML frontmatter.');
    }
    const lines = match[1].split(/\r?\n/).filter(Boolean);
    const requiredKeys = ['component', 'path', 'lastUpdated'];
    const keys = lines.map((line) => line.split(':')[0].trim());
    const missing = requiredKeys.filter((key) => !keys.includes(key));
    if (missing.length) {
      throw new Error(`Frontmatter missing keys: ${missing.join(', ')}`);
    }
  }

  private ensureHeadersInOrder(markdown: string): void {
    let previousIndex = -1;
    for (const header of REQUIRED_HEADERS) {
      const index = markdown.indexOf(header);
      if (index === -1) {
        throw new Error(`Documentation missing section: ${header}`);
      }
      if (index < previousIndex) {
        throw new Error(`Section ${header} is out of order.`);
      }
      previousIndex = index;
    }
  }

  private ensureChildLinks(markdown: string): void {
    const childSection = markdown.match(/## Child Components([\s\S]*?)(## |$)/);
    if (!childSection) {
      throw new Error('Documentation missing child component section.');
    }
    const content = childSection[1];
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'));

    if (lines.length === 0) {
      const normalized = content.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!normalized.includes('no child components')) {
        throw new Error('Child component section must either list links or explicitly state "_No child components_".');
      }
      return;
    }

    for (const line of lines) {
      if (!/\[.+?\]\(.+?\)/.test(line)) {
        throw new Error(`Child component entry missing hyperlink: ${line}`);
      }
    }
  }
}
