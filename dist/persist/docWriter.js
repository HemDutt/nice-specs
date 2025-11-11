"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocWriter = void 0;
const path_1 = require("../utils/path");
const fs_1 = require("../utils/fs");
class DocWriter {
    constructor(indexStore, embeddingStore, keyMapper) {
        this.indexStore = indexStore;
        this.embeddingStore = embeddingStore;
        this.keyMapper = keyMapper;
    }
    async write(folder, draft, signature) {
        const docUri = (0, path_1.docFileForFolder)(folder.uri);
        await (0, fs_1.writeFileText)(docUri, draft.markdown);
        await this.embeddingStore.upsert(docUri, draft.markdown);
        await this.keyMapper.replaceComponent(draft.componentId, draft.symbolIndex);
        await this.indexStore.markComponentComplete(draft.componentId, {
            folderPath: (0, path_1.workspaceRelativePath)(folder.uri),
            docPath: (0, path_1.workspaceRelativePath)(docUri),
            estimatedTokens: draft.estimatedTokens,
            children: folder.children.map((child) => child.name),
            parents: draft.metadata.parents,
            signature
        });
    }
}
exports.DocWriter = DocWriter;
//# sourceMappingURL=docWriter.js.map