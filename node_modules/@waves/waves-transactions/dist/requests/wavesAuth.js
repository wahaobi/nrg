"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module index
 */
const ts_lib_crypto_1 = require("@waves/ts-lib-crypto");
const marshall_1 = require("@waves/marshall");
const { LONG, BASE58_STRING } = marshall_1.serializePrimitives;
const generic_1 = require("../generic");
const validators_1 = require("../validators");
exports.serializeWavesAuthData = (auth) => ts_lib_crypto_1.concat(BASE58_STRING(auth.publicKey), LONG(auth.timestamp));
function wavesAuth(params, seed, chainId) {
    const seedsAndIndexes = generic_1.convertToPairs(seed);
    const publicKey = params.publicKey || generic_1.getSenderPublicKey(seedsAndIndexes, { senderPublicKey: undefined });
    const timestamp = params.timestamp || Date.now();
    validators_1.validate.wavesAuth({ publicKey, timestamp });
    const rx = {
        hash: '',
        signature: '',
        timestamp,
        publicKey,
        address: ts_lib_crypto_1.address({ publicKey }, chainId)
    };
    const bytes = exports.serializeWavesAuthData(rx);
    rx.signature = seedsAndIndexes.map(([seed]) => ts_lib_crypto_1.signBytes(seed, bytes))[0] || '';
    rx.hash = ts_lib_crypto_1.base58Encode(ts_lib_crypto_1.blake2b(Uint8Array.from(bytes)));
    return rx;
}
exports.wavesAuth = wavesAuth;
//# sourceMappingURL=wavesAuth.js.map