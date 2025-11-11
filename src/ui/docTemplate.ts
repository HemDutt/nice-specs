import { DocMetadata, SynthesizedDoc } from '../types';

export function renderDocumentation(metadata: DocMetadata, doc: SynthesizedDoc): string {
  const frontmatter = `---\ncomponent: ${metadata.component}\npath: ${metadata.path}\nlastUpdated: ${metadata.lastUpdated}\nparents:${formatArray(metadata.parents)}\nchildren:${formatArray(metadata.children)}\ntags:${formatArray(metadata.tags)}\n---`;

  const lines: string[] = [
    frontmatter,
    '',
    `# ${titleCase(metadata.component)}`,
    '',
    doc.summary || '_Pending_',
    '',
    '## Purpose',
    doc.purpose || '_Pending_',
    '',
    '## Responsibilities',
    formatBulletList(doc.responsibilities),
    '',
    '## Code Structure',
    doc.codeStructureSynopsis || '_Pending_',
    '',
    '### File Inventory'
  ];

  lines.push(...renderInventoryTable(doc.fileInventory), '');

  for (const entry of doc.codeStructure) {
    lines.push(`### ${entry.file}`, entry.summary || '_No summary_', '');
  }

  lines.push('## Data Flow & Interactions', doc.dataFlow || '_Not documented_', '', '## Dependencies', '**Internal**', formatBulletList(doc.dependencies.internal), '', '**External**', formatBulletList(doc.dependencies.external), '', '## Child Components');

  if (doc.childComponents.length === 0) {
    lines.push('_No child components_');
  } else {
    for (const child of doc.childComponents) {
      lines.push(`- [${child.name}](${child.link}) — ${child.description}`);
    }
  }

  lines.push('', '## Operational Notes', formatBulletList(doc.operationalNotes), '', '## Risks & TODOs', formatBulletList(doc.risks), '', '## Changelog');

  if (doc.changelog.length === 0) {
    lines.push(`- ${new Date().toISOString()}: Initial documentation generated.`);
  } else {
    for (const entry of doc.changelog) {
      lines.push(`- ${entry.date}: ${entry.note}`);
    }
  }

  return lines.join('\n');
}

function formatArray(values: string[]): string {
  if (!values.length) {
    return '\n  -';
  }
  return values.map((value) => `\n  - ${value}`).join('');
}

function formatBulletList(items: string[]): string {
  if (!items.length) {
    return '_None_';
  }
  return items.map((item) => `- ${item}`).join('\n');
}

function titleCase(value: string): string {
  const cleaned = value.replace(/[-_.]/g, ' ');
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}
function renderInventoryTable(entries: SynthesizedDoc['fileInventory']): string[] {
  if (!entries.length) {
    return ['_No local files detected_'];
  }
  const rows = ['| File | Synopsis | Key Symbols |', '|------|----------|-------------|'];
  for (const entry of entries) {
    rows.push(
      `| \`${entry.file}\` | ${escapeTableCell(entry.synopsis || '_Pending_')} | ${escapeTableCell(formatSymbolCell(entry.symbols))} |`
    );
  }
  return rows;
}

function formatSymbolCell(symbols: SynthesizedDoc['fileInventory'][number]['symbols']): string {
  if (!symbols.length) {
    return '_No notable symbols_';
  }
  return symbols
    .map((symbol) => {
      const chunkRef = symbol.chunkId ? ` _(chunk ${symbol.chunkId})_` : '';
      return `\`${symbol.name}\` (${symbol.kind}) — ${symbol.description}${chunkRef}`;
    })
    .join('<br/>');
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
