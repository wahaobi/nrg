"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validators_1 = require("./validators");
const authScheme = {
    publicKey: validators_1.isPublicKey,
    timestamp: validators_1.isNumber,
};
exports.authValidator = validators_1.validateByShema(authScheme, validators_1.getError);
//# sourceMappingURL=wavesAuth.js.map