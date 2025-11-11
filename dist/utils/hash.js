"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashString = hashString;
const crypto_1 = require("crypto");
function hashString(value) {
    return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
}
//# sourceMappingURL=hash.js.map