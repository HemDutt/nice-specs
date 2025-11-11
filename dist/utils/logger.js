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
exports.logInfo = logInfo;
exports.logDebug = logDebug;
exports.logWarn = logWarn;
exports.logError = logError;
const vscode = __importStar(require("vscode"));
const CHANNEL_NAME = 'Nice Specs';
let outputChannel;
function getChannel() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel(CHANNEL_NAME);
    }
    return outputChannel;
}
function log(level, message, error) {
    const timestamp = new Date().toISOString();
    const channel = getChannel();
    channel.appendLine(`[${timestamp}] [${level}] ${message}`);
    if (error) {
        const details = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
        channel.appendLine(details);
    }
}
function logInfo(message) {
    log('INFO', message);
}
function logDebug(message) {
    log('DEBUG', message);
}
function logWarn(message, error) {
    log('WARN', message, error);
}
function logError(message, error) {
    log('ERROR', message, error);
}
//# sourceMappingURL=logger.js.map