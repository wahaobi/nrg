'use strict';

/**
 * Copyright (c) 2017-present, blockcollider.org developers, All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 */

// const logging = require('../../../logger')
// const logger = logging.getLogger(__filename)

module.exports = {
  get: (server, client, payload) => {
    const blocks = server._engine.multiverse.blocks;
    const keys = Object.keys(blocks);

    const res = keys.reduce((acc, val) => {
      acc[val] = blocks[val].map(b => b.toObject());
      return acc;
    }, {});

    client.emit('multiverse.set', res);
  },

  purge: (server, client, payload) => {
    server._engine.multiverse.purge();
    server._wsBroadcast({
      type: 'multiverse.set',
      data: {}
    });
  }
};