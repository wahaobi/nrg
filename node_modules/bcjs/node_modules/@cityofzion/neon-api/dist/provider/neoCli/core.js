"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const neon_core_1 = require("@cityofzion/neon-core");
const axios_1 = __importDefault(require("axios"));
const log = neon_core_1.logging.default("api");
const BASE_REQ = neon_core_1.CONST.DEFAULT_REQ;
function throwRpcError(err) {
    throw new Error(`Encounter error code ${err.code}: ${err.message}`);
}
function getRPCEndpoint(url) {
    return url;
}
exports.getRPCEndpoint = getRPCEndpoint;
function convertNeoCliTx(tx) {
    return { index: tx.n, txid: tx.txid, value: tx.value };
}
function convertNeoCliClaimable(c) {
    return {
        claim: c.unclaimed,
        txid: c.txid,
        index: c.n,
        value: c.value,
        start: c.start_height,
        end: c.end_height
    };
}
/**
 * Get balances of NEO and GAS for an address
 * @param url - URL of a neonDB service.
 * @param address - Address to check.
 * @return  Balance of address
 */
function getBalance(url, address) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield axios_1.default.post(url, Object.assign({}, BASE_REQ, { method: "getunspents", params: [address] }));
        const data = response.data;
        if (data.error) {
            throwRpcError(data.error);
        }
        const bal = new neon_core_1.wallet.Balance({
            net: url,
            address: data.result.address
        });
        for (const assetBalance of data.result.balance) {
            if (assetBalance.amount === 0) {
                continue;
            }
            if (assetBalance.unspent.length > 0) {
                bal.addAsset(assetBalance.asset_symbol, {
                    unspent: assetBalance.unspent.map(convertNeoCliTx)
                });
            }
            else {
                bal.addToken(assetBalance.asset_symbol, assetBalance.amount);
            }
        }
        log.info(`Retrieved Balance for ${address} from neonDB ${url}`);
        return bal;
    });
}
exports.getBalance = getBalance;
function getClaims(url, address) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield axios_1.default.post(url, Object.assign({}, BASE_REQ, { method: "getclaimable", params: [address] }));
        const data = response.data;
        if (data.error) {
            throwRpcError(data.error);
        }
        return new neon_core_1.wallet.Claims({
            net: url,
            address: data.result.address,
            claims: data.result.claimable.map(convertNeoCliClaimable)
        });
    });
}
exports.getClaims = getClaims;
function getMaxClaimAmount(url, address) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield axios_1.default.post(url, Object.assign({}, BASE_REQ, { method: "getunclaimed", params: [address] }));
        const data = response.data;
        if (data.error) {
            throwRpcError(data.error);
        }
        return new neon_core_1.u.Fixed8(data.result.unclaimed).div(100000000);
    });
}
exports.getMaxClaimAmount = getMaxClaimAmount;
//# sourceMappingURL=core.js.map