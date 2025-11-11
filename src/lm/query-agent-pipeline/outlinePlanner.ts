import { ChildSummary, LedgerFact } from '../../types';
import { ScopeProfile, FileInventoryDraft, HarvesterResult, SectionPlan } from './types';

export class OutlinePlanner {
  plan(scope: ScopeProfile, inventory: FileInventoryDraft, harvest: HarvesterResult, childSummaries: ChildSummary[]): SectionPlan {
    const responsibilities = dedupeStrings(
      harvest.facts.flatMap((fact) => fact.responsibilities).filter(Boolean)
    );

    const fileInventory = inventory.files.map((file) => {
      const factsForFile = harvest.facts.filter((fact) => fact.file === file.path);
      const synopsis = factsForFile.map((fact) => fact.summary).join(' ') || describeFileFallback(file.path, file.isCode);
      const symbols = harvest.symbolsByFile[file.path] ?? [];
      return {
        file: file.path,
        synopsis,
        symbols
      };
    });

    const codeStructureSynopsis = buildStructureSynopsis(fileInventory);
    const dataFlowDescription = buildDataFlowSummary(harvest.facts);
    const dependencies = collectDependencies(harvest.facts);

    const risks = buildRiskList(scope, inventory, childSummaries);

    return {
      summary: scope.summary,
      purpose: scope.summary,
      responsibilities: responsibilities.length ? responsibilities : [scope.summary],
      fileInventory,
      codeStructureSynopsis,
      dataFlow: dataFlowDescription,
      dependencies,
      operationalNotes: [],
      risks,
      changelog: [{ date: new Date().toISOString(), note: 'Documentation refreshed' }],
      tags: scope.tags
    };
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function describeFileFallback(path: string, isCode: boolean): string {
  return isCode ? `${path} participates in component responsibilities.` : `${path} is configuration or non-code artifact.`;
}

function buildStructureSynopsis(entries: SectionPlan['fileInventory']): string {
  if (!entries.length) {
    return 'This component has no local files; responsibilities are delegated to child components.';
  }
  const highlights = entries.slice(0, 3).map((entry) => `\`${entry.file}\``);
  const tail = entries.length > 3 ? ` and ${entries.length - 3} more files` : '';
  return `Local code spans ${entries.length} files, including ${highlights.join(', ')}${tail}.`;
}

function buildDataFlowSummary(facts: LedgerFact[]): string {
  const snippets = facts
    .map((fact) => fact.analysis?.[0])
    .filter(Boolean)
    .slice(0, 3);
  if (!snippets.length) {
    return '_Not documented_';
  }
  return snippets.join(' ');
}

function collectDependencies(facts: LedgerFact[]) {
  const internal = new Set<string>();
  const external = new Set<string>();
  for (const fact of facts) {
    fact.dependencies.internal.forEach((dep) => internal.add(dep));
    fact.dependencies.external.forEach((dep) => external.add(dep));
  }
  return {
    internal: Array.from(internal),
    external: Array.from(external)
  };
}

function buildRiskList(scope: ScopeProfile, inventory: FileInventoryDraft, childSummaries: ChildSummary[]): string[] {
  const risks: string[] = [];
  if (!inventory.files.length) {
    risks.push('Folder contains no code yet is documented; confirm whether this component should aggregate child docs only.');
  }
  const missingChildren = scope.children.filter((child) => !childSummaries.find((summary) => summary.componentId === child));
  if (missingChildren.length) {
    risks.push(`Missing child documentation for: ${missingChildren.join(', ')}.`);
  }
  return risks;
}
