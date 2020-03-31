'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getSpendableOutpoints;


const { GetSpendableCollateralRequest, GetSpendableCollateralResponse } = require('../../../protos/bc_pb'); /**
                                                                                                             * Copyright (c) 2017-present, BlockCollider developers, All rights reserved.
                                                                                                             *
                                                                                                             * This source code is licensed under the MIT license found in the
                                                                                                             * LICENSE file in the root directory of this source tree.
                                                                                                             *
                                                                                                             * 
                                                                                                             */

function getSpendableOutpoints(context, call, callback) {
  const getBalanceReq = call.request;
  const address = getBalanceReq.getAddress();
  const wallet = context.server.engine.wallet;

  wallet.getSpendableOutpointsList(address).then(walletData => {
    if (walletData) callback(null, walletData);else callback(new Error(`Spendable Outpoints for ${address} not found`));
  }).catch(err => {
    callback(err);
  });
}