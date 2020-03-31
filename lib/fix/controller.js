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

/*
 *
 *  !!! STOP DEV ACTIVE https://github.com/mmpmm/overline-fix !!!
 *
 */
const debug = require('debug')('bcnode:fix:controller');
const logging = require('../logger');
const PersistenceRocksDb = require('../persistence').RocksDb;

process.on('uncaughtError', err => {
  console.trace(err); // eslint-disable-line no-console
});

class Controller {
  // eslint-disable-line no-undef

  constructor(persistence) {
    debug('fix controller start');
    this._logger = logging.getLogger(__filename);
  }
}

exports.Controller = Controller;
exports.default = Controller;