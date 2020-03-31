"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const neon_core_1 = require("@cityofzion/neon-core");
function filterHttpsOnly(nodes) {
    return nodes.filter(n => n.url.includes("https://"));
}
exports.filterHttpsOnly = filterHttpsOnly;
function raceToSuccess(promises) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const errors = yield Promise.all(promises.map(p => p.then(val => Promise.reject(val), err => err)));
            return yield Promise.reject(errors);
        }
        catch (success) {
            return success;
        }
    });
}
exports.raceToSuccess = raceToSuccess;
function getBestUrl(rpcs) {
    return __awaiter(this, void 0, void 0, function* () {
        const clients = rpcs.map(r => new neon_core_1.rpc.RPCClient(r.url));
        return yield raceToSuccess(clients.map(c => c.ping().then(_ => c.net)));
    });
}
exports.getBestUrl = getBestUrl;
function findGoodNodesFromHeight(nodes, tolerance = 1) {
    if (nodes.length === 0) {
        throw new Error("No eligible nodes found!");
    }
    const sortedNodes = nodes.slice().sort((n1, n2) => n2.height - n1.height);
    const bestHeight = sortedNodes[0].height;
    const threshold = bestHeight - tolerance;
    return sortedNodes.filter(n => n.height >= threshold);
}
exports.findGoodNodesFromHeight = findGoodNodesFromHeight;
//# sourceMappingURL=common.js.map