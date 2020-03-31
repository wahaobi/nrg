"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const neon_core_1 = require("@cityofzion/neon-core");
function addressToScriptHash(address) {
    return neon_core_1.u.reverseHex(neon_core_1.wallet.getScriptHashFromAddress(address));
}
/**
 * Returns a function that applies a APPCALL for name to a ScriptBuilder.
 * @example
 * var generator = name(contractScriptHash);
 * var script = generator().str;
 */
function name(scriptHash) {
    return (sb = new neon_core_1.sc.ScriptBuilder()) => {
        return sb.emitAppCall(scriptHash, "name");
    };
}
exports.name = name;
/**
 * Returns a function that applies a APPCALL for symbol to a ScriptBuilder.
 * @example
 * var generator = symbol(contractScriptHash);
 * var script = generator().str;
 */
function symbol(scriptHash) {
    return (sb = new neon_core_1.sc.ScriptBuilder()) => {
        return sb.emitAppCall(scriptHash, "symbol");
    };
}
exports.symbol = symbol;
/**
 * Returns a function that applies a APPCALL for decimals to a ScriptBuilder.
 * @example
 * var generator = decimals(contractScriptHash);
 * var script = generator().str;
 */
function decimals(scriptHash) {
    return (sb = new neon_core_1.sc.ScriptBuilder()) => {
        return sb.emitAppCall(scriptHash, "decimals");
    };
}
exports.decimals = decimals;
/**
 * Returns a function that applies a APPCALL for totalSupply to a ScriptBuilder.
 * @example
 * var generator = totalSupply(contractScriptHash);
 * var script = generator().str;
 */
function totalSupply(scriptHash) {
    return (sb = new neon_core_1.sc.ScriptBuilder()) => {
        return sb.emitAppCall(scriptHash, "totalSupply");
    };
}
exports.totalSupply = totalSupply;
/**
 * Returns a function that applies a APPCALL for balanceOf to a ScriptBuilder.
 * @example
 * var generator = balanceOf(contractScriptHash, address);
 * var script = generator().str;
 */
function balanceOf(scriptHash, addr) {
    return (sb = new neon_core_1.sc.ScriptBuilder()) => {
        const addressHash = addressToScriptHash(addr);
        return sb.emitAppCall(scriptHash, "balanceOf", [addressHash]);
    };
}
exports.balanceOf = balanceOf;
/**
 * Returns a function that applies a APPCALL for balanceOf to a ScriptBuilder.
 * amt is multipled by 100,000,000. The minimum number that can be provided is thus 0.00000001.
 * @example
 * var generator = transfer(contractScriptHash, sendingAddress, receivingAddress, amt);
 * var script = generator().str;
 */
function transfer(scriptHash, fromAddr, toAddr, amt) {
    return (sb = new neon_core_1.sc.ScriptBuilder()) => {
        const fromHash = addressToScriptHash(fromAddr);
        const toHash = addressToScriptHash(toAddr);
        const adjustedAmt = new neon_core_1.u.Fixed8(amt).toRawNumber();
        return sb.emitAppCall(scriptHash, "transfer", [
            fromHash,
            toHash,
            neon_core_1.sc.ContractParam.integer(adjustedAmt.toString())
        ]);
    };
}
exports.transfer = transfer;
//# sourceMappingURL=abi.js.map