"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const neon_core_1 = require("@cityofzion/neon-core");
const core_1 = require("./core");
const log = neon_core_1.logging.default("api");
class NeoCli {
    get name() {
        return `NeoCli[${this.url}]`;
    }
    constructor(url) {
        this.url = url;
        this.rpc = new neon_core_1.rpc.RPCClient(url);
        log.info(`Created NeoCli Provider: ${this.url}`);
    }
    getRPCEndpoint(noCache) {
        return Promise.resolve(this.url);
    }
    getBalance(address) {
        return core_1.getBalance(this.url, address);
    }
    getClaims(address) {
        return core_1.getClaims(this.url, address);
    }
    getMaxClaimAmount(address) {
        return core_1.getMaxClaimAmount(this.url, address);
    }
    getHeight() {
        return this.rpc.getBlockCount();
    }
    getTransactionHistory(address) {
        throw new Error("Method not implemented.");
    }
}
exports.NeoCli = NeoCli;
exports.default = NeoCli;
//# sourceMappingURL=class.js.map