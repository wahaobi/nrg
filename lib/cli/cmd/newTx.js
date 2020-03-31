'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
/**
 * Copyright (c) 2017-present, blockcollider.org developers, All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 */
const { inspect } = require('util');
const secp256k1 = require('secp256k1');

const { RpcClient } = require('../../rpc/client');
const { RpcTransaction, RpcTransactionResponse } = require('../../protos/bc_pb');
const { getLogger } = require('../../logger');
const { humanToInternal, COIN_FRACS: { NRG } } = require('../../core/coin');

const { Command } = require('commander');

const cmd = exports.cmd = (program, from, to, amount, txFee, privateKey) => {
  const rpcClient = new RpcClient();
  const log = getLogger(__filename);
  if (privateKey.startsWith('0x')) {
    privateKey = privateKey.substr(2);
  }

  if (!secp256k1.privateKeyVerify(Buffer.from(privateKey, 'hex'))) {
    log.error(`Provided private key is not valid, use a valid ECDSA private key`);
    return;
  }

  const req = new RpcTransaction();
  req.setFromAddr(from);
  req.setToAddr(to);
  req.setAmount(amount);
  req.setTxFee(txFee);
  req.setPrivateKeyHex(privateKey);

  log.info(`Sending ${inspect(req.toObject())}`);

  return rpcClient.bc.newTx(req, (err, res) => {
    if (err) {
      log.error(`Unable to create new TX, reason: (${err.code}) ${err.details}`);
    } else {
      if (res.getStatus() === 0) {
        log.info('New TX was accepted, now waiting in the unconfirmed TX pool');
      } else {
        log.warn(`TX was not accepted, reason: ${res.getError()}`);
      }
    }
  });
};