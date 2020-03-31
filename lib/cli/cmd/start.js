'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});


const { Command } = require('commander'); /**
                                           * Copyright (c) 2017-present, blockcollider.org developers, All rights reserved.
                                           *
                                           * This source code is licensed under the MIT license found in the
                                           * LICENSE file in the root directory of this source tree.
                                           *
                                           * 
                                           */

const { MINER_KEY_REGEX } = require('../minerKey');
const { getLogger } = require('../../logger');
const { Engine } = require('../../engine');

const ROVERS = Object.keys(require('../../rover/manager').rovers);
const BC_SUPER_COLLIDER = process.env.BC_SUPER_COLLIDER ? process.env.BC_SUPER_COLLIDER.toLowerCase() : 'bc';

const gracefulShutdown = (engine, exitType) => {
  console.log(`shutting down following ${exitType}`);
  setTimeout(() => {
    process.exit();
  }, 5000);

  engine.requestExit().then(() => {
    process.exit();
  }).catch(e => {
    console.trace(e);
    console.error(`error in engine.requestExit(), reason: ${e.message}`);
    process.exit(-1);
  });
};

const initSigintHandler = (logger, engine) => {
  process.on('SIGINT', () => {
    gracefulShutdown(engine, 'SIGINT');
  });
  process.on('SIGTERM', () => {
    gracefulShutdown(engine, 'SIGTERM');
  });
  process.on('uncaughtException', e => {
    console.trace(e);
    gracefulShutdown(engine, 'SIGTERM');
  });
};

const cmd = exports.cmd = async program => {
  const {
    node,
    rovers,
    rpc,
    ui,
    ws,
    overline,
    fix,
    scookie
  } = program.opts();

  // Initialize JS logger
  const logger = getLogger(__filename);

  logger.info(`starting engine...`);

  // check if RAI is active
  let rai = program.opts().rai ? true : false;

  let minerKey = process.env.BC_MINER_KEY || program.opts().minerKey;
  // If starting rovers we need to check miner key at first
  if (rovers) {
    if (!minerKey) {
      logger.error('--miner-key required');
      process.exit(-1);
    }

    if (!MINER_KEY_REGEX.test(minerKey)) {
      logger.error('miner key is malformed');
      process.exit(-2);
    }

    minerKey = minerKey.toLowerCase();
  }

  const opts = {
    rovers: ROVERS,
    overline: overline,
    fix: fix,
    minerKey,
    rai

    // Create engine instance
  };const engine = new Engine(opts);

  // Initialize engine
  try {
    await engine.init();
    // Initialize SIGING handler
    initSigintHandler(logger, engine);
  } catch (e) {
    logger.error(`failed to initialize protocol, reason: ${e.message}`);
    return -1;
  }

  if (node) {
    engine.startNode().then(() => {
      logger.info('local node startup complete -> Block Collider protocol initializing...');
    });
  }

  // Should the FIX protocol be available?
  if (fix) {
    engine.startFix().then(() => {
      // ROVER DEVELOPMENT TEAM PROGRAM: FIX
      // <--- LAUNCH KEY-CODE START ---> //
      // <--- LAUNCH KEY-CODE END ---> //
    });
  }

  // Should the Server be started?
  if (rpc || ui || ws) {
    await engine.startServer({
      rpc, // Enable RPC - /rpc
      ui, // Enable UI - /
      ws, // Enable WS - /ws
      rpcSecureCookie: scookie
    });
  }

  // Should the Rover be started?
  if (rovers) {
    const roversToStart = rovers === true ? ROVERS : rovers.split(',').map(roverName => roverName.trim().toLowerCase());

    // TODO: Move somewhere else
    const BC_ROVER_REPLAY = process.env.BC_ROVER_REPLAY;
    if (BC_ROVER_REPLAY === 'true' || BC_ROVER_REPLAY === '1') {
      engine.rovers.replay();
    }

    const latestBlock = await engine.persistence.get(`${BC_SUPER_COLLIDER}.block.latest`);
    let forceResync = false;
    if (latestBlock && parseInt(latestBlock.getHeight(), 10) > 2) {
      forceResync = true;
    }
    engine.startRovers(roversToStart, forceResync).then(() => logger.info(`rovers successfully deployed to network [${roversToStart}]`));
  }

  // Should we enable Overline?
  if (overline) {
    engine.startOverline().then(() => {
      // ROVER DEVELOPMENT TEAM: OVERLINE
      // <--- LAUNCH KEY-CODE START ---> //
      // <--- LAUNCH KEY-CODE END ---> //
    });
  }

  // TODO: Wait for engine finish
  // engine.wait()
};