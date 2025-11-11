"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncate = truncate;
function truncate(value, length = 160) {
    if (!value) {
        return '';
    }
    return value.length > length ? `${value.slice(0, length)}…` : value;
}
//# sourceMappingURL=promptUtils.js.map