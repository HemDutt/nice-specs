import { DocDraft, FolderNode } from '../types';
import { docFileForFolder, workspaceRelativePath } from '../utils/path';
import { writeFileText } from '../utils/fs';
import { IndexStore } from './indexStore';
import { EmbeddingStore } from './embeddingStore';
import { KeyMapper } from './keyMapper';

export class DocWriter {
  constructor(private readonly indexStore: IndexStore, private readonly embeddingStore: EmbeddingStore, private readonly keyMapper: KeyMapper) {}

  async write(folder: FolderNode, draft: DocDraft, signature: string): Promise<void> {
    const docUri = docFileForFolder(folder.uri);
    await writeFileText(docUri, draft.markdown);
    await this.embeddingStore.upsert(docUri, draft.markdown);
    await this.keyMapper.replaceComponent(draft.componentId, draft.symbolIndex);
    await this.indexStore.markComponentComplete(draft.componentId, {
      folderPath: workspaceRelativePath(folder.uri),
      docPath: workspaceRelativePath(docUri),
      estimatedTokens: draft.estimatedTokens,
      children: folder.children.map((child) => child.name),
      parents: draft.metadata.parents,
      signature
    });
  }
}
