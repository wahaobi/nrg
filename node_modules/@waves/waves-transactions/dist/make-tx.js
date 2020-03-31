"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const transactions_1 = require("./transactions");
const issue_1 = require("./transactions/issue");
const transfer_1 = require("./transactions/transfer");
const reissue_1 = require("./transactions/reissue");
const burn_1 = require("./transactions/burn");
const lease_1 = require("./transactions/lease");
const cancel_lease_1 = require("./transactions/cancel-lease");
const alias_1 = require("./transactions/alias");
const mass_transfer_1 = require("./transactions/mass-transfer");
const data_1 = require("./transactions/data");
const set_script_1 = require("./transactions/set-script");
const set_asset_script_1 = require("./transactions/set-asset-script");
const sponsorship_1 = require("./transactions/sponsorship");
const exchange_1 = require("./transactions/exchange");
const invoke_script_1 = require("./transactions/invoke-script");
/**
 * Makes transaction from params. Validates all fields and calculates id
 */
function makeTx(params) {
    switch (params.type) {
        case transactions_1.TRANSACTION_TYPE.ISSUE:
            return issue_1.issue(params);
        case transactions_1.TRANSACTION_TYPE.TRANSFER:
            return transfer_1.transfer(params);
        case transactions_1.TRANSACTION_TYPE.REISSUE:
            return reissue_1.reissue(params);
        case transactions_1.TRANSACTION_TYPE.BURN:
            return burn_1.burn(params);
        case transactions_1.TRANSACTION_TYPE.LEASE:
            return lease_1.lease(params);
        case transactions_1.TRANSACTION_TYPE.CANCEL_LEASE:
            return cancel_lease_1.cancelLease(params);
        case transactions_1.TRANSACTION_TYPE.ALIAS:
            return alias_1.alias(params);
        case transactions_1.TRANSACTION_TYPE.MASS_TRANSFER:
            return mass_transfer_1.massTransfer(params);
        case transactions_1.TRANSACTION_TYPE.DATA:
            return data_1.data(params);
        case transactions_1.TRANSACTION_TYPE.SET_SCRIPT:
            return set_script_1.setScript(params);
        case transactions_1.TRANSACTION_TYPE.SET_ASSET_SCRIPT:
            return set_asset_script_1.setAssetScript(params);
        case transactions_1.TRANSACTION_TYPE.SPONSORSHIP:
            return sponsorship_1.sponsorship(params);
        case transactions_1.TRANSACTION_TYPE.EXCHANGE:
            return exchange_1.exchange(params);
        case transactions_1.TRANSACTION_TYPE.INVOKE_SCRIPT:
            return invoke_script_1.invokeScript(params);
        default:
            throw new Error(`Unknown tx type: ${params.type}`);
    }
}
exports.makeTx = makeTx;
//# sourceMappingURL=make-tx.js.map