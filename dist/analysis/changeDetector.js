"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeDetector = void 0;
const path_1 = require("../utils/path");
const cancellation_1 = require("../utils/cancellation");
const git_1 = require("../utils/git");
const SEMANTIC_KEYWORDS = ['if', 'else', 'switch', 'return', 'class', 'function', 'async', 'await', 'throw', 'implements', 'extends', 'export', 'import', 'public', 'private'];
const CONTRACT_KEYWORDS = ['export', 'implements', 'extends', 'interface', 'type'];
class ChangeDetector {
    constructor(indexStore, workspaceRoot, signatureScanner) {
        this.indexStore = indexStore;
        this.workspaceRoot = workspaceRoot;
        this.signatureScanner = signatureScanner;
    }
    async selectTargets(nodes, token, force) {
        const targets = [];
        const resumeComponent = this.indexStore.getInProgressComponent();
        const lastCommit = this.indexStore.getLastCommit();
        const folderMap = new Map();
        nodes.forEach((node) => folderMap.set((0, path_1.workspaceRelativePath)(node.uri, this.workspaceRoot), node));
        const gitCandidates = lastCommit ? await this.collectGitCandidates(folderMap, lastCommit) : new Set();
        for (const node of nodes) {
            (0, cancellation_1.throwIfCancelled)(token);
            const componentId = (0, path_1.componentIdFromUri)(node.uri, this.workspaceRoot);
            if (resumeComponent && componentId !== resumeComponent) {
                continue;
            }
            const signature = await this.signatureScanner.computeSignature(node);
            if (force || gitCandidates.has(componentId) || this.signatureChanged(componentId, signature)) {
                targets.push({ node, signature });
            }
        }
        return targets;
    }
    signatureChanged(componentId, signature) {
        const record = this.indexStore.selectComponent(componentId);
        if (!record) {
            return true;
        }
        return record.signature !== signature;
    }
    async collectGitCandidates(folderMap, lastCommit) {
        const candidates = new Set();
        const changes = await (0, git_1.getChangedFilesSince)(this.workspaceRoot, lastCommit);
        for (const change of changes) {
            const folder = this.locateFolderForFile(change.file, folderMap);
            if (!folder) {
                continue;
            }
            const componentId = (0, path_1.componentIdFromUri)(folder.uri, this.workspaceRoot);
            if (isSemanticChange(change.diff)) {
                candidates.add(componentId);
                if (touchesContract(change.diff)) {
                    const parentId = parentComponent(componentId);
                    if (parentId) {
                        candidates.add(parentId);
                    }
                }
            }
        }
        return candidates;
    }
    locateFolderForFile(file, folderMap) {
        const normalized = file.replace(/\\/g, '/');
        let current = normalized;
        while (current.length > 0) {
            if (folderMap.has(current)) {
                return folderMap.get(current);
            }
            const idx = current.lastIndexOf('/');
            if (idx < 0) {
                break;
            }
            current = current.slice(0, idx);
        }
        return folderMap.get('');
    }
}
exports.ChangeDetector = ChangeDetector;
function isSemanticChange(diff) {
    const lines = diff.split(/\r?\n/);
    return lines.some((line) => {
        if (!line.startsWith('+') && !line.startsWith('-')) {
            return false;
        }
        const trimmed = line.slice(1).trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
            return false;
        }
        return SEMANTIC_KEYWORDS.some((keyword) => trimmed.includes(keyword));
    });
}
function touchesContract(diff) {
    return diff.split(/\r?\n/).some((line) => CONTRACT_KEYWORDS.some((keyword) => line.includes(keyword)));
}
function parentComponent(componentId) {
    const parts = componentId.split('.');
    if (parts.length <= 1) {
        return undefined;
    }
    return parts.slice(0, -1).join('.');
}
//# sourceMappingURL=changeDetector.js.map