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
exports.PersonaClient = void 0;
exports.collectResponseText = collectResponseText;
exports.safeJsonParse = safeJsonParse;
const vscode = __importStar(require("vscode"));
class PersonaClient {
    constructor(model) {
        this.model = model;
    }
    async invoke(role, prompt, token, justification) {
        const personaPrefix = personaPrompts[role];
        const response = await this.model.sendRequest([vscode.LanguageModelChatMessage.User(`${personaPrefix}\n\n${prompt}`)], { justification }, token);
        return collectResponseText(response);
    }
}
exports.PersonaClient = PersonaClient;
async function collectResponseText(response) {
    let markdown = '';
    for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
            markdown += chunk.value;
        }
    }
    return markdown.trim();
}
function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
const personaPrompts = {
    DocOrchestrator: 'You are DocOrchestrator. Plan documentation tasks step-by-step before writing.',
    CodeAnalyst: 'You are CodeAnalyst. Return structured JSON summaries extracted directly from code.',
    DocSynthesizer: 'You are DocSynthesizer. Convert structured facts into documentation JSON following the schema.',
    QualityReviewer: 'You are QualityReviewer. Rigorously review documentation for accuracy and completeness.'
};
//# sourceMappingURL=personaClient.js.map