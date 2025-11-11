"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIgnored = isIgnored;
exports.componentIdFromUri = componentIdFromUri;
exports.docFileForFolder = docFileForFolder;
exports.relativeLink = relativeLink;
exports.workspaceRelativePath = workspaceRelativePath;
exports.compileGitignore = compileGitignore;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const ALWAYS_IGNORED_SEGMENTS = new Set([
    'node_modules',
    'bower_components',
    '.git',
    '.github',
    '.idea',
    '.vscode',
    '.nicespecs',
    'dist',
    'out',
    'build',
    '.next',
    '.turbo',
    'vendor',
    'third_party',
    'third-party',
    'external',
    '__pycache__',
    '.venv'
]);
const ALWAYS_IGNORED_FILES = new Set([
    '.ds_store',
    'thumbs.db',
    'desktop.ini',
    '.gitignore',
    '.gitattributes',
    '.npmrc',
    '.nvmrc',
    '.editorconfig',
    '.eslintignore',
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.json',
    '.prettierrc',
    '.prettierrc.js',
    '.prettierrc.json',
    '.stylelintrc',
    'codeowners',
    'jenkinsfile',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'tsconfig.build.tsbuildinfo',
    'tsconfig.tsbuildinfo',
    'react-library.json',
    'package.json'
]);
const TEST_DIR_NAMES = new Set(['__tests__', '__mocks__', 'tests', 'test', 'spec', 'specs', 'stories']);
const TEST_FILE_PATTERNS = [
    /\.test\.[^/]+$/i,
    /\.spec\.[^/]+$/i,
    /\.stories\.[^/]+$/i,
    /\.story\.[^/]+$/i,
    /\.snap$/i,
    /\.mock\.[^/]+$/i,
    /\.fixture\.[^/]+$/i,
    /-test\.[^/]+$/i,
    /-spec\.[^/]+$/i
];
function isIgnored(uri, root, ignoreGlobs, gitignoreRules = []) {
    const relative = workspaceRelativePath(uri, root);
    if (!relative) {
        return false;
    }
    const segments = relative.split(/[\\/]/).filter(Boolean);
    const loweredSegments = segments.map((segment) => segment.toLowerCase());
    const lastSegment = loweredSegments.length ? loweredSegments[loweredSegments.length - 1] : undefined;
    if (lastSegment && ALWAYS_IGNORED_FILES.has(lastSegment)) {
        return true;
    }
    if (loweredSegments.some((segment) => ALWAYS_IGNORED_SEGMENTS.has(segment))) {
        return true;
    }
    const loweredGlobs = ignoreGlobs.map((glob) => glob.toLowerCase());
    if (loweredGlobs.some((glob) => loweredSegments.includes(glob))) {
        return true;
    }
    if (isTestRelativePath(relative, loweredSegments)) {
        return true;
    }
    return gitignoreRules.length > 0 ? matchesGitignore(relative, gitignoreRules) : false;
}
function componentIdFromUri(uri, root) {
    const relative = workspaceRelativePath(uri, root) || '';
    if (!relative) {
        return rootComponentId();
    }
    return relative
        .split(/[\\/]/)
        .filter(Boolean)
        .map((segment) => segment.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '-'))
        .join('.');
}
function docFileForFolder(folder) {
    const name = folder.path.split('/').filter(Boolean).pop() ?? rootComponentId();
    const normalized = name.toLowerCase();
    return vscode.Uri.joinPath(folder, `nicespecs.${normalized}.md`);
}
function relativeLink(from, to) {
    const relative = path.relative(path.dirname(from.fsPath), to.fsPath);
    if (!relative || relative.startsWith('..')) {
        return path.basename(to.fsPath);
    }
    return relative.replace(/\\/g, '/');
}
function workspaceRelativePath(uri, root) {
    const baseUri = root ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!baseUri) {
        return uri.fsPath;
    }
    let relative = path.relative(baseUri.fsPath, uri.fsPath);
    if (!relative || relative === '.') {
        return '';
    }
    return relative.replace(/\\/g, '/');
}
function rootComponentId() {
    const workspaceName = vscode.workspace.name;
    return workspaceName ? workspaceName.replace(/\s+/g, '-').toLowerCase() : 'root';
}
function isTestRelativePath(relative, loweredSegments) {
    if (loweredSegments.some((segment) => TEST_DIR_NAMES.has(segment))) {
        return true;
    }
    const filename = loweredSegments[loweredSegments.length - 1];
    if (!filename) {
        return false;
    }
    return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}
function compileGitignore(patterns) {
    const rules = [];
    for (const rawLine of patterns) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim()) {
            continue;
        }
        let pattern = line;
        let escapedLeading = false;
        if (pattern.startsWith('\\')) {
            pattern = pattern.slice(1);
            escapedLeading = true;
        }
        if (!escapedLeading && pattern.startsWith('#')) {
            continue;
        }
        let negated = false;
        if (!escapedLeading && pattern.startsWith('!')) {
            negated = true;
            pattern = pattern.slice(1);
        }
        pattern = pattern.replace(/\s+$/, '');
        if (!pattern) {
            continue;
        }
        const directoryOnly = pattern.endsWith('/');
        if (directoryOnly) {
            pattern = pattern.slice(0, -1);
        }
        const anchored = pattern.startsWith('/');
        if (anchored) {
            pattern = pattern.slice(1);
        }
        if (!pattern) {
            continue;
        }
        const regex = buildGitignoreRegex(pattern, anchored, directoryOnly);
        rules.push({ regex, negated });
    }
    return rules;
}
function matchesGitignore(relativePath, rules) {
    let ignored = false;
    for (const rule of rules) {
        if (rule.regex.test(relativePath)) {
            ignored = !rule.negated;
        }
    }
    return ignored;
}
function buildGitignoreRegex(pattern, anchored, directoryOnly) {
    const tokens = [];
    for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];
        if (char === '*') {
            if (pattern[i + 1] === '*') {
                tokens.push('.*');
                i += 1;
            }
            else {
                tokens.push('[^/]*');
            }
        }
        else if (char === '?') {
            tokens.push('[^/]');
        }
        else if (char === '\\') {
            if (i + 1 < pattern.length) {
                tokens.push(escapeRegex(pattern[i + 1]));
                i += 1;
            }
        }
        else {
            tokens.push(escapeRegex(char));
        }
    }
    const body = tokens.join('');
    const prefix = anchored ? '^' : '(^|.*/)';
    const suffix = directoryOnly ? '(?:/.*)?$' : '$';
    return new RegExp(`${prefix}${body}${suffix}`);
}
function escapeRegex(value) {
    return value.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}
//# sourceMappingURL=path.js.map