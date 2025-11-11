import * as vscode from 'vscode';
import { PersonaRole } from '../types';

export class PersonaClient {
  constructor(private readonly model: vscode.LanguageModelChat) {}

  async invoke(role: PersonaRole, prompt: string, token: vscode.CancellationToken, justification: string): Promise<string> {
    const personaPrefix = personaPrompts[role];
    const response = await this.model.sendRequest(
      [vscode.LanguageModelChatMessage.User(`${personaPrefix}\n\n${prompt}`)],
      { justification },
      token
    );
    return collectResponseText(response);
  }
}

export async function collectResponseText(response: vscode.LanguageModelChatResponse): Promise<string> {
  let markdown = '';
  for await (const chunk of response.stream) {
    if (chunk instanceof vscode.LanguageModelTextPart) {
      markdown += chunk.value;
    }
  }
  return markdown.trim();
}

export function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

const personaPrompts: Record<PersonaRole, string> = {
  DocOrchestrator: 'You are DocOrchestrator. Plan documentation tasks step-by-step before writing.',
  CodeAnalyst: 'You are CodeAnalyst. Return structured JSON summaries extracted directly from code.',
  DocSynthesizer: 'You are DocSynthesizer. Convert structured facts into documentation JSON following the schema.',
  QualityReviewer: 'You are QualityReviewer. Rigorously review documentation for accuracy and completeness.'
};
