import * as vscode from 'vscode';

const CHANNEL_NAME = 'Nice Specs';
let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return outputChannel;
}

function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const channel = getChannel();
  channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  if (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
    channel.appendLine(details);
  }
}

export function logInfo(message: string): void {
  log('INFO', message);
}

export function logDebug(message: string): void {
  log('DEBUG', message);
}

export function logWarn(message: string, error?: unknown): void {
  log('WARN', message, error);
}

export function logError(message: string, error?: unknown): void {
  log('ERROR', message, error);
}
