import * as vscode from 'vscode';

export async function readFileText(uri: vscode.Uri): Promise<string> {
  const buffer = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(buffer).toString('utf8');
}

export async function writeFileText(uri: vscode.Uri, contents: string): Promise<void> {
  const buffer = Buffer.from(contents, 'utf8');
  await vscode.workspace.fs.writeFile(uri, buffer);
}
