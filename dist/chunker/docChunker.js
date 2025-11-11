"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocChunker = void 0;
const path_1 = require("../utils/path");
const fs_1 = require("../utils/fs");
const CHILD_SECTIONS = ['Purpose', 'Responsibilities', 'Dependencies', 'Operational Notes'];
class DocChunker {
    async loadChildSummaries(folder) {
        const summaries = [];
        const parentDoc = (0, path_1.docFileForFolder)(folder.uri);
        for (const child of folder.children) {
            const docFile = (0, path_1.docFileForFolder)(child.uri);
            try {
                const markdown = await (0, fs_1.readFileText)(docFile);
                const sections = extractSections(markdown);
                const synopsis = [sections['Purpose'], sections['Responsibilities']].filter(Boolean).join('\n\n');
                summaries.push({
                    componentId: child.name,
                    docPath: docFile,
                    synopsis,
                    relativeLink: (0, path_1.relativeLink)(parentDoc, docFile),
                    sections
                });
            }
            catch {
                // Child doc might not exist yet.
            }
        }
        return summaries;
    }
}
exports.DocChunker = DocChunker;
function extractSections(markdown) {
    const sections = {};
    for (const section of CHILD_SECTIONS) {
        const pattern = new RegExp(`## ${section}[\\r\\n]+([\\s\\S]*?)(?:\\n## |$)`, 'i');
        const match = markdown.match(pattern);
        sections[section] = match ? match[1].trim() : '_Not documented_';
    }
    return sections;
}
//# sourceMappingURL=docChunker.js.map