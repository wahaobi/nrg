'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

/*
 * Copyright (c) 2017-present, Block Collider developers, All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 */

const { RoverMessage, RoverMessageType } = require('../protos/rover_pb');
const { machineId } = require('node-machine-id');

// $FlowFixMe: disable warnings from libraries
console.warn = () => {}; // eslint-disable-line no-console

const crypto = require('crypto');
const { spawn } = require('child_process');
const { Multiverse } = require('../bc/multiverse');
const { EventEmitter } = require('events');
const QueueEventEmitter = require('queue-event-emitter');
const { join, resolve } = require('path');
const { existsSync, writeFileSync } = require('fs');

const debug = require('debug')('bcnode:engine');
const bufferSplit = require('buffer-split');
const { max, merge, is, uniq, values, last } = require('ramda');
const maxmind = require('maxmind');
const LRUCache = require('lru-cache');
const BN = require('bn.js');
const semver = require('semver');
const fkill = require('fkill');
const fs = require('fs');
const Random = require('random-js');
const secp256k1 = require('secp256k1');

const { Server } = require('../server/index');
const { config } = require('../config');
const { ensureDebugPath, isDebugEnabled } = require('../debug');
const { getLogger } = require('../logger');
const { Monitor } = require('../monitor');
const { DISABLE_IPH_TEST, Node } = require('../p2p');
const { Overline } = require('../overline');
const { encodeTypeAndData } = require('../p2p/codec');
const { MESSAGES, MSG_SEPARATOR } = require('../p2p/protocol');
const { RoverManager } = require('../rover/manager');
const { ROVER_SECONDS_PER_BLOCK, ROVER_RESYNC_PERIOD, getBacksyncEpoch, ROVER_CONFIRMATIONS } = require('../rover/utils');
const { BC_SUPER_COLLIDER, ChainState } = require('../bc/chainstate');
const rovers = require('../rover/manager').rovers;
const PersistenceRocksDb = require('../persistence').RocksDb;
const { PubSub } = require('./pubsub');
const { RpcServer } = require('../rpc/index');
const { getGenesisBlock } = require('../bc/genesis');
const { getBootBlock } = require('../bc/bootblock');
const { validateSequenceDifficulty, getConfirmationsChildrenNewestBlock, validateCoinbase } = require('../bc/validation');
const { Block, BcBlock, Transaction, TransactionOutput, TransactionInput, OutPoint } = require('../protos/core_pb');
const { RpcTransactionResponseStatus } = require('../protos/bc_pb');
const { errToString } = require('../helper/error');
const { getVersion, getRemoteVersion } = require('../helper/version');
const { MiningOfficer, BC_STALE_NETWORK_TIMEOUT } = require('../mining/officer');
const { WorkerPool } = require('../mining/pool');
const ts = require('../utils/time').default; // ES6 default export
const { sortBlocks } = require('../utils/protoBuffers');
const { parseBoolean } = require('../utils/config');
const { txHash, txInputSignature, ScriptTemplates, getMaxDistanceWithEmblems, BC_COINBASE_MATURITY, COINBASE_TX_ESTIMATE_SIZE } = require('../core/txUtils');
const { TxHandler } = require('../primitives/txHandler');
const { default: TxPendingPool } = require('../bc/txPendingPool');
const { Wallet } = require('../bc/wallet');
const { Dex } = require('../bc/dex');

const { blake2bl } = require('../utils/crypto');
const { internalToHuman, internalToBN, humanToBN, COIN_FRACS: { NRG, BOSON } } = require('../core/coin');
let numCPUs = max(1, Number(require('os').cpus().length) - 1);

const GEO_DB_PATH_A = resolve(__dirname, '..', '..', 'data', 'GeoLite2-City.mmdb');
const GEO_DB_PATH_B = resolve(__dirname, '..', '..', 'data', 'GeoIP2-City.mmdb');
// const PKG = require('../../package.json')
const BC_NETWORK = process.env.BC_NETWORK || 'main';
const dataDirSuffix = BC_NETWORK === 'main' ? '' : `_${BC_NETWORK}net`;
const DATA_DIR = `${process.env.BC_DATA_DIR || config.persistence.path}${dataDirSuffix}`;
const MONITOR_ENABLED = process.env.BC_MONITOR === 'true';
const BC_CHECK = process.env.BC_CHECK === 'true';
const BC_BUILD_GENESIS = process.env.BC_BUILD_GENESIS === 'true';
const PERSIST_ROVER_DATA = process.env.PERSIST_ROVER_DATA === 'true';
const CHAINSTATE_DIR = process.env.BC_CHAINSTATE_DIR ? process.env.BC_CHAINSTATE_DIR : DATA_DIR;
const BC_REMOVE_BTC = parseBoolean(process.env.BC_REMOVE_BTC);
const BC_FETCH_MISSING_BLOCKS = !!process.env.BC_FETCH_MISSING_BLOCKS;
const BC_RUST_MINER = !!process.env.BC_RUST_MINER;
const BC_PREVENT_INITIAL_SYNC = parseBoolean(process.env.BC_PREVENT_INITIAL_SYNC);
const BC_MINER_WORKERS = process.env.BC_MINER_WORKERS !== undefined ? parseInt(process.env.BC_MINER_WORKERS) : numCPUs;
const BC_LOG_BLOCK_STATS = exports.BC_LOG_BLOCK_STATS = process.env.BC_LOG_BLOCK_STATS === 'true';
const BC_RUST_CLI_PATH = isDebugEnabled() ? resolve(__dirname, '..', '..', 'rust', 'bcrust-core', 'target', 'release', 'bcrust-miner') : resolve(__dirname, '..', '..', 'rust', 'bcrust-core', 'target', 'debug', 'bcrust-miner');
const BTC_BOOT_BLOCK = process.env.BTC_BOOT_BLOCK;
let blockStatStream = false;

const rebaseWorkers = () => {
  try {
    // LDL
    debug(`rebase workers event fired on process: ${process.pid}`);
    Promise.all([fkill('bcworker1', { force: true, silent: true }), fkill('bcworker2', { force: true, silent: true }), fkill('bcworker3', { force: true, silent: true }), fkill('bcworker4', { force: true, silent: true })]).then(() => {
      debug(`bcworkers exited`);
    }).catch(e => {
      debug(e);
    });
  } catch (_) {}
};

const rebasePool = () => {
  try {
    fkill('bcpool', { force: true, silent: true }).then(() => {
      debug(`pool exited`);
    }).catch(err => {
      debug(err);
    });
  } catch (err) {
    console.trace(err);
  }
};

class Engine {

  constructor(opts) {
    if (BC_LOG_BLOCK_STATS) {
      const statFilePath = process.cwd() + '/block_stats.csv';
      blockStatStream = fs.createWriteStream(statFilePath);
      blockStatStream.write(`timestamp,blockTimestamp,height,hash,distance,difficulty,totalDistance,miner,minerReward,txs,nrgMined,newBlocks\n`);
      this._blockStats = blockStatStream;
      console.log(`block stat stream file path: ${statFilePath}`);
    }

    const globalVariablesLog = Object.keys(process.env).reduce((all, key) => {
      if (key.slice(0, 3) === 'BC_') {
        all = `${all}\n${key}: ${process.env[key]}`;
      }
      return all;
    }, 'BC GLOBAL CONFIGRUATION');

    if (opts.rai) {
      this._logger.info(`starting engine with rovers commanded by RAI`);
    }

    const cs = new ChainState(CHAINSTATE_DIR, opts.rovers, { writable: true });
    this._loggedBcBlocks = [];
    this._loggedBcBalances = {};
    this._emblemPerformance = 0;
    this._logger = getLogger(__filename);
    this._knownRovers = opts.rovers;
    this._minerKey = opts.minerKey; // TODO only needed because of server touches that - should be passed using constructor?
    this._rawBlock = [];
    this._blockCache = [];
    this._monitor = new Monitor(this, {});
    this._chainState = cs;
    this._persistence = new PersistenceRocksDb(DATA_DIR, cs, this);
    this._pubsub = new PubSub();
    this._node = new Node(this);
    this._emitter = new QueueEventEmitter();
    this._roverEmitter = new EventEmitter();
    this._asyncEmitter = new EventEmitter();
    this._rovers = new RoverManager(this._persistence, this._emitter, this._roverEmitter);
    this._rpc = new RpcServer(this);
    this._server = new Server(this, this._rpc);
    this._subscribers = {};
    this._verses = [];
    this._stepSyncTimestamps = [];
    this._isOpen = false;

    // release max
    this._emitter.setMaxListeners(0);
    this._asyncEmitter.setMaxListeners(0);
    this._roverEmitter.setMaxListeners(0);

    // Open Maxmind Geo DB
    this._geoDb = maxmind.openSync(GEO_DB_PATH_A);
    this._geoDbValidate = maxmind.validate;

    this._knownEvaluationsCache = new LRUCache({
      max: config.engine.knownBlocksCache.max
    });

    this._knownBlocksCache = new LRUCache({
      max: config.engine.knownBlocksCache.max
    });

    this._knownTxsCache = new LRUCache({
      max: 5000
    });

    this._knownFullBlocksCache = new LRUCache({
      max: config.engine.knownFullBlocksCache.max
    });

    this._rawBlocks = new LRUCache({
      max: config.engine.rawBlocksCache.max
    });

    this._peerRequestCache = new LRUCache({
      max: 50
    });

    this._peerIsSyncing = false;
    this._peerIsResyncing = false;
    this._txPendingPool = new TxPendingPool(this._persistence);
    this._txHandler = new TxHandler(this._persistence, this._txPendingPool);
    this._wallet = new Wallet(this._persistence, this._txPendingPool);
    this._dex = new Dex(this._persistence, this.minerKey);

    setInterval(async () => {
      await this._persistence.processPeerExpiration();
    }, 91000);

    // Start NTP sync
    ts.start();
  } // TODO only needed because of server touches that - should be passed using constructor?


  get geoDbValidate() {
    return this._geoDbValidate;
  }

  get geoDb() {
    return this._geoDb;
  }

  // TODO only needed because of server touches that - should be passed using constructor?
  get minerKey() {
    return this._minerKey;
  }

  /**
   * Get WorkerPool
   * @returns {WorkerPool|*}
   */
  get workerPool() {
    return this._workerPool;
  }

  /**
   * Get multiverse
   * @returns {Multiverse|*}
   */
  get multiverse() {
    return this.node.multiverse;
  }

  set multiverse(multiverse) {
    this.node.multiverse = multiverse;
  }

  /**
   * Get pubsub wrapper instance
   * @returns {PubSub}
   */
  get pubsub() {
    return this._pubsub;
  }

  get wallet() {
    return this._wallet;
  }

  initRustMiner() {
    this._logger.info('Starting rust miner', BC_RUST_CLI_PATH);
    const env = isDebugEnabled() ? { RUST_BACKTRACE: 'full' } : {};
    if (existsSync(BC_RUST_CLI_PATH)) {
      const proc = spawn(BC_RUST_CLI_PATH, [], { env: merge(process.env, env) });
      proc.stdout.on('data', data => {
        this._logger.info(`bcrust-miner: ${data}`);
      });
      proc.stderr.on('data', data => {
        this._logger.info(`bcrust-miner: ${data}`);
      });
      proc.on('close', code => {
        this._logger.info(`bcrust-miner: process exited with code ${code}`);
        this.initRustMiner();
      });
    } else {
      this._logger.error("bcrust-miner: rust miner binary doesn't exist");
    }
  }

  /**
   * Initialize engine internals
   *
   * - Open database
   * - Store name of available rovers
   */
  async init() {

    rebaseWorkers();
    rebasePool();

    if (false || BC_RUST_MINER) {
      this.initRustMiner();
    }

    const roverNames = Object.keys(rovers);
    const {
      npm,
      git: {
        long
      }
    } = getVersion();
    const newGenesisBlock = getGenesisBlock();
    const versionData = {
      version: npm,
      commit: long,
      db_version: 1
    };

    const DB_LOCATION = resolve(`${__dirname}/../../${this.persistence._db.location}`);
    const DELETE_MESSAGE = `DB data structure is stale, delete data folder '${DB_LOCATION}' and run bcnode again`;
    // TODO get from CLI / config
    try {
      await this._persistence.open();
      let version = await this.persistence.get('appversion');
      // silently continue if version === null - the version is not present so
      // a) very old db
      // b) user just remove database so let's store it
      if (version && semver.lt(version.version, '0.7.7')) {
        // GENESIS BLOCK 0.9
        this._logger.warn(DELETE_MESSAGE);
        process.exit(8);
      }
      let res = await this.persistence.put('rovers', roverNames);
      if (res) {
        this._logger.debug('stored rovers to persistence');
      }
      res = await this.persistence.put('appversion', versionData);
      if (res) {
        this._logger.debug('stored appversion to persistence');
      }

      const now = Math.floor(Date.now() * 0.001);
      await this.persistence.put('minelock', now);

      if (BC_REMOVE_BTC === true) {
        this._logger.warn('REMOVE BTC BLOCK LATEST FLAG TRIGGERED');
        try {
          // remove btc block
          await this.persistence.del(`btc.block.latest`);
        } catch (err) {
          this._logger.debug(err);
        }
      }
      const latestBlock = await this.persistence.get(`${BC_SUPER_COLLIDER}.block.latest`);
      if (!latestBlock || BC_BUILD_GENESIS) {
        if (BC_BUILD_GENESIS) {
          this._logger.info(`BC_BUILD_GENESIS === true -> building new database`);
        } else {
          this._logger.info(`latest block not found <- building new database`);
        }
        try {
          await this.persistence.put('synclock', newGenesisBlock);
          await this.persistence.putBlock(newGenesisBlock);

          if (this._chainState) {
            this._chainState.putLatestBlock(BC_SUPER_COLLIDER, 1, newGenesisBlock.getHash());
            this._chainState._memory.put(`${BC_SUPER_COLLIDER}.range.highest.height`, 1);
            this._chainState._memory.put(`${BC_SUPER_COLLIDER}.range.lowest.height`, 1);
            this._chainState._memory.put(`${BC_SUPER_COLLIDER}.range.highest.hash`, newGenesisBlock.getHash());
            this._chainState._memory.put(`${BC_SUPER_COLLIDER}.range.lowest.hash`, newGenesisBlock.getHash());
          }
          await this.persistence.del(`${BC_SUPER_COLLIDER}.miner.radians`);
          await this.persistence.put(`${BC_SUPER_COLLIDER}.sync.initialsync`, 'pending');
          await this.persistence.put(`${BC_SUPER_COLLIDER}.block.latest`, newGenesisBlock);
          await this.persistence.put(`${BC_SUPER_COLLIDER}.block.parent`, newGenesisBlock);
          await this.persistence.put(`${BC_SUPER_COLLIDER}.block.oldest`, newGenesisBlock);
          await this.persistence.put(`${BC_SUPER_COLLIDER}.block.checkpoint`, newGenesisBlock);
          await this.persistence.put(`${BC_SUPER_COLLIDER}.dht.quorum`, 0);
          await this.persistence.del(`${BC_SUPER_COLLIDER}.data.latest`);
          await this.persistence.del(`${BC_SUPER_COLLIDER}.sync.initialpeer`);
          await this.persistence.del(`${BC_SUPER_COLLIDER}.sync.edge`);
          await this.persistence.put(`${BC_SUPER_COLLIDER}.depth`, 2);
          console.log(``);
          console.log(``);
          console.log(`     BLOCK COLLIDER NODE ${npm} (${new Date().toString()})`);
          console.log('     GENESIS HASH: ' + newGenesisBlock.getHash());
          console.log('     SUPER COLLIDER: ' + BC_SUPER_COLLIDER);
          console.log('     MINELOCK: ' + now);
          console.log('     ENGINE CACHE: ' + config.engine.knownBlocksCache.max);
          console.log('     STALE NETWORK: ' + BC_STALE_NETWORK_TIMEOUT);
          console.log('     BLOCKCHAIN FINGERPRINT: ' + config.blockchainFingerprintsHash);
          console.log(``);
          console.log(``);
          await validateCoinbase(newGenesisBlock, this.persistence, this._txHandler, 'engine');
        } catch (e) {
          this._logger.error(`error while creating genesis block ${e.message}`);
          process.exit(1);
        }
      } else {
        // if chainstate is available minimally ensure latest block is in line with persistence
        if (this._chainState) {
          const hasLatestBlock = this._chainState._memory.get(`${BC_SUPER_COLLIDER}.block.latest.height`);
          if (!hasLatestBlock) {
            this._chainState.putLatestBlock(BC_SUPER_COLLIDER, parseInt(latestBlock.getHeight(), 10), latestBlock.getHash());
          }
          for (let rover of Object.keys(rovers)) {
            this._logger.info(`synchronizing KV store with ${rover} chainstate`);
            const hasLatestBlock = this._chainState._memory.get(`${rover}.block.latest.height`);
            const hasRockBlock = await this.persistence.get(`${rover}.block.latest`);
            if (hasRockBlock) {
              if (!hasLatestBlock || parseInt(hasRockBlock.getHeight(), 10) !== hasLatestBlock) {
                this._chainState.putLatestBlock(rover, parseInt(hasRockBlock.getHeight(), 10), hasRockBlock.getHash());
                this._logger.info(`updated -> ${rover} chainstate from KV store to height ${hasRockBlock.getHeight()}`);
              }
            }
          }
        }
        await this.persistence.del(`${BC_SUPER_COLLIDER}.miner.radians`);
        await this.persistence.put(`${BC_SUPER_COLLIDER}.sync.edge`, 1);
        await this.persistence.put('synclock', newGenesisBlock);
        await this.persistence.put(`${BC_SUPER_COLLIDER}.block.oldest`, newGenesisBlock);
        await this.persistence.put(`${BC_SUPER_COLLIDER}.block.parent`, newGenesisBlock);
        await this.persistence.put(`${BC_SUPER_COLLIDER}.dht.quorum`, 0);
        for (let key of this._knownRovers) {
          this._logger.info(`instructing ${key} rover to find latest edge`);
          await this.persistence.del(`${key}.block.latest`);
        }
        let sumSoFar = await this.persistence.getNrgMintedSoFar();
        console.log(``);
        console.log(``);
        console.log(`     BLOCK COLLIDER NODE ${npm} (${new Date().toString()})`);
        console.log(`     GENESIS BLOCK: ${newGenesisBlock.getHeight()} : ${newGenesisBlock.getHash()}`);
        console.log(`     LATEST BLOCK: ${latestBlock.getHeight()} : ${latestBlock.getHash()}`);
        console.log(`     LATEST BLOCK DIFFICULTY: ${latestBlock.getDifficulty()}`);
        console.log(`     NRG MULTICHAIN BALANCE: ${sumSoFar}`);
        console.log(`     SUPER COLLIDER CTX: ${BC_SUPER_COLLIDER}`);
        console.log(`     MINELOCK: ${now}`);
        console.log(`     ENGINE CACHE ${config.engine.knownBlocksCache.max}`);
        console.log('     STALE NETWORK: ' + BC_STALE_NETWORK_TIMEOUT);
        console.log(`     BLOCKCHAIN FINGERPRINT: ${config.blockchainFingerprintsHash}`);
        console.log(``);
        console.log(``);
      }

      if (process.env.BC_BOOT_BLOCK) {
        const bootBlock = getBootBlock(process.env.BC_BOOT_BLOCK);
        await this.persistence.put(`${BC_SUPER_COLLIDER}.block.latest`, bootBlock);
        await this.persistence.putBlock(bootBlock);
        await this.multiverse._chain.unshift(bootBlock);
        this._logger.warn('boot block ' + bootBlock.getHeight() + ' assigned as latest block');
      }
    } catch (e) {
      this._logger.warn(`could not store rovers to persistence, reason ${e.message}`);
    }

    if (BC_CHECK === true) {
      await this.integrityCheck();
    }

    if (MONITOR_ENABLED) {
      this._monitor.start();
    }

    this.pubsub.subscribe('update.block.latest', '<engine>', msg => {
      try {
        if (!this._knownEvaluationsCache.has(msg.data.getHash())) {
          this._knownEvaluationsCache.set(msg.data.getHash(), true);
          // TODO: Check if any blocks are not the current one and reuse if its new
          this.updateLatestAndStore(msg).then(previousBlock => {
            if (msg.mined === true) {
              this._logger.debug(`latest block ${msg.data.getHeight()} has been updated`);
            } else {
              this._blockCache.length = 0;
            }
          }).catch(err => {
            this._logger.info(errToString(err));
            this._logger.error(`error occurred during updateLatestAndStore(), reason: ${err.message}`);
            process.exit();
          });
        }
      } catch (err) {
        this._logger.error(err);
      }
    });

    // GENERATE BLOCKS - BEGIN

    const BC_PLUGIN = process.env.BC_PLUGIN;
    if (BC_PLUGIN) {
      const pluginPath = resolve(join(__dirname, '..', '..', BC_PLUGIN));
      try {
        const plugin = require(pluginPath);
        await plugin.main(this);
      } catch (err) {
        this._logger.error('PLUGIN ERROR', err);
        this._logger.error(err);
      }
    }

    this._workerPool = new WorkerPool(this._persistence, {
      minerKey: this._minerKey,
      emitter: this._asyncEmitter
    });

    const miningOfferOpts = {
      minerKey: this._minerKey,
      rovers: this._knownRovers,
      txHandler: this._txHandler
    };
    this._miningOfficer = new MiningOfficer(this._pubsub, this._persistence, this._workerPool, this._txPendingPool, this._chainState, this._emitter, miningOfferOpts);

    this._asyncEmitter.on('mined', data => {
      process.nextTick(() => {
        this.miningOfficer._handleWorkerFinishedMessage(data);
      });
    });

    this._workerPool.emitter.on('blockCacheRebase', () => {
      this._logger.info('block cache rebase requested');
      this.persistence.get('bc.block.latest').then(previousBlock => {
        if (this._blockCache.length > 0 && previousBlock) {
          const candidates = this._blockCache.reduce((all, block) => {
            const blockchains = previousBlock.getBlockchainHeaders().toObject();
            const key = block.getBlockchain() + 'List';
            const headers = blockchains[key];
            const found = headers.reduce((f, header) => {
              if (all === false) {
                if (block.getHeight() > header.getHeight()) {
                  f = true;
                }
              }
              return f;
            }, false);

            if (found === true) {
              all.push(block);
            }
            return all;
          }, []);
          this._blockCache.length = 0;
          if (candidates.length > 0) {
            this._blockCache = candidates;
            const allRoversHaveSufficientBlocks = this._miningOfficer._knownRovers.reduce((state, chain) => {
              if (state) {
                const minBlockCount = Math.floor(ROVER_RESYNC_PERIOD / ROVER_SECONDS_PER_BLOCK[chain]);
                return this._miningOfficer._collectedBlocks[chain] && this._miningOfficer._collectedBlocks[chain] > minBlockCount && this._miningOfficer._collectedBlocks[chain] > 1;
              } else {
                return false;
              }
            }, true);
            const nextBlock = this._blockCache.shift();
            const syncComplete = this.node._discovery.connected < 2 ? true : this.node._syncComplete;
            const roversClaimToBeSynced = this._rovers.areRoversSynced() && syncComplete && allRoversHaveSufficientBlocks;
            this._logger.info(`mining work will be sent ${roversClaimToBeSynced} follow block cache rebase`);
            const fullBlockCache = roversClaimToBeSynced ? this._knownFullBlocksCache : false;
            this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, nextBlock.getHash());
            this.miningOfficer._cleanUnfinishedBlock();
            if (BC_MINER_WORKERS < 1) {
              rebaseWorkers();
            }
            this._workerPool._sendMessage({ type: 'segment' }).then(() => {
              this.miningOfficer.newRoveredBlock(roverNames, nextBlock, this._blockCache, roversClaimToBeSynced, fullBlockCache).then(pid => {
                if (pid !== false) {
                  this._logger.info(`collectBlock reassigned sent to miner`);
                }
              }).catch(err => {
                this._logger.error(`could not send to mining worker, reason: ${errToString(err)}`);
                process.exit();
              });
            });
          }
        }
      }).catch(err => {
        this._logger.debug(err);
      });
    });
    return Promise.resolve(true);
  }

  /**
   * Store a block in persistence unless its Genesis Block
   * @returns Promise
   */
  async updateLatestAndStore(msg) {
    const block = msg.data;
    this._logger.info('store block: ' + block.getHeight() + ' ' + block.getHash());
    try {
      const previousLatest = await this.persistence.get('bc.block.latest');
      const parent = await this.persistence.get('bc.block.parent');
      const synclock = await this.persistence.get('synclock');

      // check if there is a decision tree cycle required
      if (previousLatest && parent && parent.getHash() !== previousLatest.getPreviousHash() && new BN(block.getTotalDistance()).gt(new BN(previousLatest.getTotalDistance())) && new BN(block.getTimestamp()).gte(new BN(previousLatest.getTimestamp()))) {
        // reset to previousLatestPath
        // behavior must be echoed in multiverse
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.putBlock(block);
      } else if (previousLatest && previousLatest.getHash() === block.getPreviousHash() && new BN(block.getTimestamp()).gt(new BN(parent.getTimestamp())) === true && validateSequenceDifficulty(previousLatest, block) === true) {
        await this.persistence.put('bc.block.parent', previousLatest);
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.putBlock(block);
      } else if (previousLatest.getHeight() === 1) {
        await this.persistence.put('bc.block.parent', previousLatest);
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.putBlock(block);
      } else if (msg.force === true && msg.multiverse !== undefined && msg.multiverse.constructor === Array.constructor && synclock && synclock.getHeight() === 1) {
        const oldest = msg.multiverse[msg.multiverse - 1];
        // get the block before the oldest available block
        const grandparent = await this.persistence.get(`bc.block.${oldest.getHeight() - 1}`);
        if (!grandparent || oldest.getPreviousHash() !== grandparent.getHash()) {
          // this is a new chain branch and we must sync for it
          await this.persistence.put('synclock', oldest);
        }
        await this.persistence.put('bc.block.parent', msg.multiverse[1]);
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.putBlock(block);
        /*
         * Remove this after block 100,000
         */
      } else if (msg.force === true && synclock.getHeight() === 1) {
        await this.persistence.put('synclock', block);
        // here we set it up so that on the next cycle we can compare paths
        await this.persistence.put('bc.block.parent', previousLatest);
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.putBlock(block);
      } else if (parent.getHash() === block.getPreviousHash()) {
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.put(block, 0);
      } else {
        this._logger.warn('block ' + block.getHeight() + ' ' + block.getHash() + ' as latest block <- mutates chain to stronger branch');
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.put(block, 0);
      }

      if (msg.multiverse !== undefined) {
        while (msg.multiverse.length > 0) {
          const b = msg.multiverse.pop();
          // strict local only write of genesis block
          if (b.getHeight() > 1) {
            await this.persistence.putBlock(b);
          }
        }
        return Promise.resolve(block);
      }

      if (this.miningOfficer._canMine === false) {
        this._logger.info('determining if rovered headers include new child blocks');
        const latestRoveredHeadersKeys = this.miningOfficer._knownRovers.map(chain => `${chain}.block.latest`);
        const latestBlockHeaders = await this.persistence.getBulk(latestRoveredHeadersKeys);
        latestBlockHeaders.map(r => {
          if (r && this.miningOfficer._collectedBlocks[r.getBlockchain()] < 1) {
            this.miningOfficer._collectedBlocks[r.getBlockchain()]++;
          }
        });
      }
      return Promise.resolve(block);
    } catch (err) {
      this._logger.warn(err);
      this._logger.error(errToString(err));
      this._logger.warn('no previous block found');
      // TODO: also move on the top while getting parent and previous latest
      if (block !== undefined && msg.force === true) {
        await this.persistence.put('bc.block.parent', getGenesisBlock());
        await this.persistence.put('bc.block.latest', block);
        await this.persistence.putBlock(block);
      } else {
        this._logger.warn('submitted block ' + block.getHeight() + ' ' + block.getHash() + ' will not be persisted');
      }
      if (msg.multiverse !== undefined) {
        // assert the valid state of the entire sequence of each rovered chain
        // DISABLED for BT: const multiverseIsValid = this.miningOfficer.validateRoveredSequences(msg.multiverse)
        while (msg.multiverse.length > 0) {
          const b = msg.multiverse.pop();
          if (b.getHeight() > 1) {
            await this.persistence.putBlock(b);
          }
        }
        return Promise.resolve(block);
      }
      return Promise.resolve(block);
    }
  }

  /**
   * Get node
   * @return {Node}
   */
  get node() {
    return this._node;
  }

  /**
   * Get rawBlock
   * @return {Object}
   */
  get rawBlock() {
    return this._rawBlock;
  }

  /**
   * Set rawBlock
   * @param block
   */
  set rawBlock(block) {
    this._rawBlock = block;
  }

  /**
   * Get persistence
   * @return {Persistence}
   */
  get persistence() {
    return this._persistence;
  }

  /**
   * Get rovers manager
   * @returns RoverManager
   */
  get rovers() {
    return this._rovers;
  }

  /**
   * Get instance of RpcServer
   * @returns RpcServer
   */
  get rpc() {
    return this._rpc;
  }

  /**
   * Get instance of Server (Express on steroids)
   * @returns Server
   */
  get server() {
    return this._server;
  }

  get chainState() {
    return this._chainState;
  }

  get miningOfficer() {
    return this._miningOfficer;
  }

  /**
   * Start Server
   */
  async startNode() {

    if (this._minerKey) {
      let perf = 0;
      const emblemPerformance = await getMaxDistanceWithEmblems(this._minerKey, this.persistence);
      if (emblemPerformance) {
        // bonus minus default
        perf = max(0, (emblemPerformance.emblemBonus - 2) / emblemPerformance.emblemBonus * 100);
        if (perf > 0) {
          perf = parseFloat(perf).toFixed(2);
        }
      }
      this._emblemPerformance = perf;
    } else {
      this._emblemPerformance = 0;
    }
    this._logger.info('starting P2P node');
    let nodeObject = false;
    const now = Math.floor(Date.now() * 0.001);
    if (BC_COINBASE_MATURITY !== 100) {
      this._logger.warn(`BC_COINBASE_MATURITY set to ${BC_COINBASE_MATURITY} <- this invalidates consensus`);
    }
    try {
      this._logger.info('loading network key');
      const nodeObjectData = await this.persistence.get(`${BC_SUPER_COLLIDER}.dht.id`);
      try {
        nodeObject = JSON.parse(nodeObjectData);
      } catch (e) {
        nodeObject = nodeObjectData;
      }
    } catch (err) {
      console.trace(err);
      // empty catch for letting nodeObject be created
    }

    let nodeId;
    let nodeTimestamp;
    if (!nodeObject || DISABLE_IPH_TEST) {
      this._logger.warn('P2P node data not stored - creating machine network id');
      const mid = await machineId();
      nodeId = crypto.createHash('sha1').update(crypto.randomBytes(32).toString('hex')).digest('hex');
      //nodeId = crypto.createHash('sha1').update(mid).digest('hex')
      nodeObject = {
        id: nodeId,
        timestamp: Math.floor(Date.now() * 0.001)
      };
      nodeTimestamp = nodeObject.timestamp;
      this._logger.info('assigned edge mutation key <- ' + nodeId);
      this._logger.info('assigned machine key <- ' + mid);
      await this.persistence.put(`${BC_SUPER_COLLIDER}.dht.id`, nodeObject);
    } else if (nodeObject) {
      nodeId = crypto.createHash('sha1').update(crypto.randomBytes(32).toString('hex')).digest('hex');
      //nodeId = crypto.createHash('sha1').update(mid).digest('hex')
      nodeTimestamp = nodeObject.timestamp;
    } else {
      nodeId = crypto.createHash('sha1').update(crypto.randomBytes(32).toString('hex')).digest('hex');
      nodeTimestamp = Math.floor(Date.now() * 0.001);
      await this.persistence.put(`${BC_SUPER_COLLIDER}.dht.id`, {
        id: nodeId,
        timestamp: nodeTimestamp
      });
    }
    this._logger.info('network creation epoch ' + nodeTimestamp);

    // if the key is more than 1 week old reset it
    if (new BN(new BN(nodeTimestamp).add(new BN(604800))).lt(new BN(now))) {
      this._logger.warn('key needs to be set');
      nodeId = crypto.createHash('sha1').update(crypto.randomBytes(32).toString('hex')).digest('hex');
      this._logger.info('asssigned node ID <- ' + nodeId);
      await this.persistence.put(`${BC_SUPER_COLLIDER}.dht.id`, {
        id: nodeId,
        timestamp: Math.floor(Date.now() * 0.001)
      });
    }

    this._emitter.on('peerCount', count => {
      if (this._server) {
        this._server._wsBroadcastPeerCount(count);
      }
    });
    return this.node.start(nodeId);
  }

  /**
   * Create interface to Overline
   */
  async startOverline() {}

  /**
   * Enable FIX 4 data protocol
   */
  async startFix() {
    // Install module bc-fix-rpc bridge
    // use LAUNCH KEY-CODE
  }

  async blockFromPeer({ conn, newBlock, options }) {
    debug(`--- DEBUG ---`);
    debug(JSON.stringify(options, null, 2));

    const roverList = [];
    for (let key of this._knownRovers) {
      roverList.push(key);
    }

    const address = conn.remoteAddress + ':' + conn.remotePort;
    const { fullBlock, ipd, iph } = options;
    this._logger.debug(`${BC_SUPER_COLLIDER} [] <- [] block ${newBlock.getHeight()} : ${newBlock.getHash()}`);
    let boundariesToFetchPromise = false;
    if (BC_FETCH_MISSING_BLOCKS) {
      debug(`BC_FETCH_MISSING_BLOCKS === true <- getting missing blocks enabled ${BC_FETCH_MISSING_BLOCKS}`);
      const headers = newBlock.getBlockchainHeaders();
      boundariesToFetchPromise = this.persistence.getBlockBoundariesToFetch(headers);
    }

    const cache = fullBlock ? this._knownFullBlocksCache : this._knownBlocksCache;
    const heardFromPeer = this._peerRequestCache.has(conn.remoteAddress + newBlock.getHash());

    debug(`following boundaries new block: ${newBlock.getHeight()}:${newBlock.getHash()}`);
    debug(`blockFromPeer() iph: ${iph} ipd: ${ipd}`);

    if (newBlock && !cache.get(newBlock.getHash()) && !heardFromPeer) {

      const latestBlock = await this.persistence.get(`${BC_SUPER_COLLIDER}.block.latest`);
      const initialPeer = await this.persistence.get(`${BC_SUPER_COLLIDER}.sync.initialpeer`);

      if (parseInt(newBlock.getHeight(), 10) > 1) {
        cache.set(newBlock.getHash(), true);
      }

      const headersMap = newBlock.getBlockchainHeaders();
      const headers = Object.keys(headersMap.toObject()).reduce((all, listName) => {
        const getMethodName = `get${listName[0].toUpperCase()}${listName.slice(1)}`;
        const chainHeaders = headersMap[getMethodName]();
        return all.concat(sortBlocks(chainHeaders));
      }, []);

      const missingHeaders = await Promise.all(headers.filter(header => !this.persistence.getBlockByHash(header.getHash(), header.getBlockchain()))); // put child blocks
      if (missingHeaders && missingHeaders.length > 0) {
        debug(`missing headers in block ${newBlock.getHeight()} <- ${missingHeaders.length}`);
      }

      const isValid = await this.persistence.isValidBlockCached(newBlock, { fullBlock });
      if (!isValid) {
        this._logger.info(`block ${newBlock.getHash()} is not valid`);
        return;
      }
      // Add block to LRU cache to avoid processing the same block twice
      debug(`Adding received ${fullBlock ? 'full ' : ''}block into cache of known blocks - ${newBlock.getHash()}`);
      debug(`received new ${fullBlock ? 'full ' : ''}block from peer, height ${newBlock.getHeight()}`);
      if (fullBlock) {
        debug('fullBlock to be expanded');
        if (!latestBlock) {
          this._logger.warn(`blockFromPeer() could not find latest BC block - cannot validate transactions`);
          return Promise.resolve(false);
        }

        // first evaluate if the block itself is valid
        debug(`passing block to multiverse.extendMultiverse ${newBlock.getHeight()} : ${newBlock.getHash()} iph: ${iph} ipd: ${ipd}`);
        const replaceLatestBlock = cache.get(newBlock.getHeight());
        const { stored, needsResync, rangeRequest, schedules, assertSyncComplete, blockSendingAlternative } = await this.multiverse.extendMultiverse(newBlock, 'peer', true, options.handleAsNewPeer, address, replaceLatestBlock);

        if (assertSyncComplete) {
          this.node.syncComplete = true;
        }

        if (!stored && !needsResync && !rangeRequest && !blockSendingAlternative) {
          debug(`sending better edge for block ${newBlock.getHeight()} from peer...`);
          cache.del(newBlock.getHash());
          if (!this._peerRequestCache.has(conn.remoteAddress + newBlock.getHash())) {
            this._peerRequestCache.set(conn.remoteAddress + newBlock.getHash(), true);
            this._asyncEmitter.emit(`sendblock`, { data: latestBlock, connection: conn });
          } else {
            this._peerRequestCache.del(conn.remoteAddress + newBlock.getHash());
          }
          return Promise.resolve(false);
        }

        if (blockSendingAlternative) {
          debug(`stored: false, needsResync: false, rangeRequest: false block ${newBlock.getHeight()} from peer is being ignored`);
          return Promise.resolve(false);
        }

        debug(`stored: ${stored} ${newBlock.getHeight()}`);
        if (stored) {
          // send block to other peers
          cache.set(newBlock.getHeight(), newBlock);
          rebaseWorkers();
          this.miningOfficer._cleanUnfinishedBlock();
          if (!needsResync) {
            this.node.broadcastNewBlock(newBlock);
            if (BC_LOG_BLOCK_STATS) {
              if (this._loggedBcBlocks.indexOf(newBlock.getHash()) < 0) {
                this._loggedBcBlocks.push(newBlock.getHash());
                if (!this._loggedBcBalances[newBlock.getMiner()]) {
                  this._loggedBcBalances[newBlock.getMiner()] = Math.round(newBlock.getNrgGrant());
                } else {
                  this._loggedBcBalances[newBlock.getMiner()] += Math.round(newBlock.getNrgGrant());
                }
              }
              const newBlocks = newBlock.getBlockchainHeadersCount ? newBlock.getBlockchainHeadersCount() : 0;
              blockStatStream.write(`${Math.floor(new Date() / 1000)},${newBlock.getTimestamp()},${newBlock.getHeight()},${newBlock.getHash()},${newBlock.getDistance()},${newBlock.getDifficulty()},${newBlock.getTotalDistance()},${newBlock.getMiner().slice(2, 30)},${this._loggedBcBalances[newBlock.getMiner()]},${newBlock.getTxsList().length},${Math.round(newBlock.getNrgGrant())},${newBlocks}\n`);
            }
            // immediately check if there is work available
            process.nextTick(async () => {
              await this.miningOfficer.newRoveredBlock(roverList, false, this._blockCache, true, this._knownFullBlocksCache);
            });
          }
          this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, newBlock.getHash());
          this._knownFullBlocksCache.set(newBlock.getHash(), newBlock);

          this.pubsub.publish('block.peer', {
            type: 'block.peer',
            data: newBlock
          });
        }

        if (needsResync && rangeRequest && rangeRequest.highestHeight) {
          //this._emitter.emit('collectBlock', { block: newBlock })
          debug(`range request highest height: ${rangeRequest.highestHeight} lowest height: ${rangeRequest.lowestHeight}`);
          this._asyncEmitter.emit('requestBlockRange', [rangeRequest.highestHeight, rangeRequest.lowestHeight, conn]);
          if (!stored) {
            this.miningOfficer._cleanUnfinishedBlock();
            rebaseWorkers();
            // immediate check if there is work available
            process.nextTick(async () => {
              await this.miningOfficer.newRoveredBlock(roverList, false, this._blockCache, true, this._knownFullBlocksCache);
            });
          }
          return;
        }
      } else {
        //
        //
        //  OVERLINE USE
        //  complete the partial block
        //
        //
        this._logger.info('no full block found');
        const { stored, needsResync, rangeRequest, schedules, assertSyncComplete, blockSendingAlternative } = await this.multiverse.extendMultiverse(newBlock, 'peer', true, false, address);

        if (assertSyncComplete) {
          this.node.syncComplete = true;
        }

        // store any relavent block schedules to evaluate when/if that child chain block height is available
        if (schedules.length > 0) {
          await Promise.all(schedules.map((schedule, i) => {
            this._logger.info(`adding schedule ${i}`);
            return this.persistence.scheduleAtBlockHeight(schedule[0], schedule[1], schedule[2], schedule[3], schedule[4]);
          }));
        }

        if (needsResync && rangeRequest && rangeRequest.highestHeight) {
          this._asyncEmitter.emit('requestBlockRange', [rangeRequest.highestHeight, rangeRequest.lowestHeight]);
        }

        const request = { dimension: 'hash', id: newBlock.getHash(), connection: conn };
        this._emitter.emit('getTxs', request);
        // make sure IPH and IPD are complete before asking for sets to catch up
        resyncFullNode = needsResync && iph === 'complete' && ipd === 'complete';
        resyncTestNode = DISABLE_IPH_TEST && rangeRequest && rangeRequest.highestHeight;
        if (resyncTestNode || resyncFullNode) {
          if (latestBlock !== null) {
            const diff = new BN(parseInt(newBlock.getHeight(), 10)).sub(new BN(parseInt(latestBlock.getHeight(), 10)).sub(new BN(1))).toNumber();
            const high = parseInt(newBlock.getHeight(), 10);
            const low = new BN(parseInt(newBlock.getHeight(), 10)).sub(new BN(diff)).toNumber();
            //this._logger.info(`requesting GET_BLOCKS from peer low: ${low} high: ${high} diff: ${diff}`)
            debug(`passing block to multiverse.extendMultiverse ${newBlock.getHeight()} : ${newBlock.getHash()} iph: ${iph} ipd: ${ipd}`);
            //this._logger.info(`new ${fullBlock ? 'full ' : ''}block ${stored ? 'NOT ' : ''}stored ${newBlock.getHeight()}`)

            if (stored) {

              if (!needsResync) {
                this.node.broadcastNewBlock(newBlock);
                rebaseWorkers();
                this.miningOfficer._cleanUnfinishedBlock();
                // immediately check if there is work available
                process.nextTick(async () => {
                  await this.miningOfficer.newRoveredBlock(roverList, false, this._blockCache, true, this._knownFullBlocksCache);
                });
              }
              this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, newBlock.getHash());
              // send partial block to other peers
              this._logger.info(`new Block from peer: ${newBlock.getHeight()}`);
              this.pubsub.publish('block.peer', {
                type: 'block.peer',
                data: newBlock
              });
            }

            debug(`blockFromPeer() iph: ${iph} ipd: ${ipd}`);
            // TODO: Dibsaled if (needsResync && iph === 'complete' && ipd === 'complete') {
            if (needsResync && iph === 'complete' && ipd !== 'pending') {
              const getBlockListMessage = {
                data: {
                  high: newBlock.getHeight(),
                  low: new BN(latestBlock.getHeight()).sub(new BN(6)).toNumber()
                },
                connection: conn
              };
              this._emitter.emit('getblocklist', getBlockListMessage);
            } else if (needsResync) {
              debug(`ignored resync from multiverse IPH: ${iph} IPD: ${ipd}`);
            }
          }
        } else {
          // get a full block
          const request = { dimension: 'hash', id: newBlock.getHash(), connection: conn };
          this._emitter.emit('getTxs', request);
          //this._logger.info(`new ${fullBlock ? 'full ' : ''}block ${stored ? 'NOT ' : ''}stored ${newBlock.getHeight()}`)
          // make sure IPH and IPD are complete before asking for sets to catch up
          if (needsResync && iph === 'complete' && ipd !== 'pending') {
            this.persistence.get('bc.block.latest').then(latestBlock => {
              if (latestBlock !== null) {
                const getBlockListMessage = {
                  data: {
                    high: newBlock.getHeight(),
                    low: new BN(latestBlock.getHeight()).sub(new BN(6)).toNumber()
                  },
                  connection: conn
                };
                this._emitter.emit('getblocklist', getBlockListMessage);
              } else {
                this._logger.error(new Error('critical error: unable to get bc.block.latest <- all super collider nodes will be vulnerable'));
              }
            }).catch(err => {
              this._logger.error(err);
            });
          }
        }
      }
    } else {
      this._logger.info(`newBlock already in cache ${newBlock.getHash()}`);
    }
  }

  /**
   * Start rovers
   * @param rovers - list (string; comma-delimited) of rover names to start
   */
  async startRovers(rovers, forceResync = false) {
    this._logger.info(`starting rovers '${rovers.join(',')}'`);

    const needsResyncData = await this.persistence.getDecisivePeriodOfCrossChainBlocksStatus();
    for (const roverName of rovers) {
      if (roverName) {
        // if (roverName === 'btc' && needsResyncData[roverName].latestBlock && needsResyncData[roverName].latestBlock.getPreviousHash() === BTC_BOOT_BLOCK) {
        //  this.miningOfficer._collectedBlocks[roverName] = 1
        // }
        if (!BC_PREVENT_INITIAL_SYNC) {
          await this._rovers.startRover(roverName, false, forceResync);
        }
        if (!BC_PREVENT_INITIAL_SYNC && roverName === 'btc') {
          const needsResyncData = await this.persistence.getDecisivePeriodOfCrossChainBlocksStatus(Date.now(), [roverName]);
          if (needsResyncData[roverName].latestBlock && needsResyncData[roverName].latestBlock.getPreviousHash() === BTC_BOOT_BLOCK) {
            this.miningOfficer._collectedBlocks[roverName] = 1;
          }
        }
      }
    }

    this.pubsub.subscribe('rover.request', '<engine>', msg => {
      this._logger.info(`transferring rover request ${msg.data.rover} ${msg.data.lowest} -> ${msg.data.highest}`);
      if (this._rovers._roverSyncStatus[msg.data.rover] === true) {
        this._emitter.emit('requestRoverRange', msg.data);
      } else {
        this._logger.info(`yielding direct fetch block requests for rover ${msg.data.rover} until sync is complete`);
      }
    });

    this._asyncEmitter.on('blockFromPeer', async ({ conn, newBlock, options }) => {
      debug(`--- DEBUG ---`);
      debug(JSON.stringify(options, null, 2));

      const address = conn.remoteAddress + ':' + conn.remotePort;
      const { fullBlock, ipd, iph } = options;
      this._logger.debug(`${BC_SUPER_COLLIDER} [] <- [] block ${newBlock.getHeight()} : ${newBlock.getHash()}`);
      let boundariesToFetchPromise = false;
      if (BC_FETCH_MISSING_BLOCKS) {
        debug(`BC_FETCH_MISSING_BLOCKS === true <- getting missing blocks enabled ${BC_FETCH_MISSING_BLOCKS}`);
        const headers = newBlock.getBlockchainHeaders();
        boundariesToFetchPromise = this.persistence.getBlockBoundariesToFetch(headers);
      }

      const cache = fullBlock ? this._knownFullBlocksCache : this._knownBlocksCache;
      const heardFromPeer = this._peerRequestCache.has(conn.remoteAddress + newBlock.getHash());

      debug(`following boundaries new block: ${newBlock.getHeight()}:${newBlock.getHash()}`);
      debug(`blockFromPeer() iph: ${iph} ipd: ${ipd}`);

      if (newBlock && !cache.get(newBlock.getHash()) && !heardFromPeer) {

        const latestBlock = await this.persistence.get(`${BC_SUPER_COLLIDER}.block.latest`);
        const initialPeer = await this.persistence.get(`${BC_SUPER_COLLIDER}.sync.initialpeer`);

        if (parseInt(newBlock.getHeight(), 10) > 1) {
          cache.set(newBlock.getHash(), true);
        }

        const headersMap = newBlock.getBlockchainHeaders();
        const headers = Object.keys(headersMap.toObject()).reduce((all, listName) => {
          const getMethodName = `get${listName[0].toUpperCase()}${listName.slice(1)}`;
          const chainHeaders = headersMap[getMethodName]();
          return all.concat(sortBlocks(chainHeaders));
        }, []);

        const missingHeaders = await Promise.all(headers.filter(header => !this.persistence.getBlockByHash(header.getHash(), header.getBlockchain()))); // put child blocks
        if (missingHeaders && missingHeaders.length > 0) {
          debug(`missing headers in block ${newBlock.getHeight()} <- ${missingHeaders.length}`);
        }

        const isValid = await this.persistence.isValidBlockCached(newBlock, { fullBlock });
        if (!isValid) {
          this._logger.info(`block ${newBlock.getHash()} is not valid`);
          return;
        }
        // Add block to LRU cache to avoid processing the same block twice
        debug(`Adding received ${fullBlock ? 'full ' : ''}block into cache of known blocks - ${newBlock.getHash()}`);
        debug(`received new ${fullBlock ? 'full ' : ''}block from peer, height ${newBlock.getHeight()}`);
        if (fullBlock) {
          debug('fullBlock to be expanded');
          if (!latestBlock) {
            this._logger.warn(`blockFromPeer() could not find latest BC block - cannot validate transactions`);
            return Promise.resolve(false);
          }

          // first evaluate if the block itself is valid
          debug(`passing block to multiverse.extendMultiverse ${newBlock.getHeight()} : ${newBlock.getHash()} iph: ${iph} ipd: ${ipd}`);
          const { stored, needsResync, rangeRequest, schedules, assertSyncComplete, blockSendingAlternative } = await this.multiverse.extendMultiverse(newBlock, 'peer', true, options.handleAsNewPeer, address);

          if (assertSyncComplete) {
            this.node.syncComplete = true;
          }

          if (!stored && !needsResync && !rangeRequest && !blockSendingAlternative) {
            debug(`sending better edge for block ${newBlock.getHeight()} from peer...`);
            cache.del(newBlock.getHash());
            if (!this._peerRequestCache.has(conn.remoteAddress + newBlock.getHash())) {
              this._peerRequestCache.set(conn.remoteAddress + newBlock.getHash(), true);
              this._asyncEmitter.emit(`sendblock`, { data: latestBlock, connection: conn });
            } else {
              this._peerRequestCache.del(conn.remoteAddress + newBlock.getHash());
            }
            return Promise.resolve(false);
          }

          if (blockSendingAlternative) {
            debug(`stored: false, needsResync: false, rangeRequest: false block ${newBlock.getHeight()} from peer is being ignored`);
            return Promise.resolve(false);
          }

          debug(`stored: ${stored} ${newBlock.getHeight()}`);
          if (stored) {
            // send block to other peers
            this.miningOfficer._cleanUnfinishedBlock();
            rebaseWorkers();
            if (!needsResync) {
              this.node.broadcastNewBlock(newBlock);
              if (BC_LOG_BLOCK_STATS) {
                if (this._loggedBcBlocks.indexOf(newBlock.getHash()) < 0) {
                  this._loggedBcBlocks.push(newBlock.getHash());
                  if (!this._loggedBcBalances[newBlock.getMiner()]) {
                    this._loggedBcBalances[newBlock.getMiner()] = Math.round(newBlock.getNrgGrant());
                  } else {
                    this._loggedBcBalances[newBlock.getMiner()] += Math.round(newBlock.getNrgGrant());
                  }
                }
                const newBlocks = newBlock.getBlockchainHeadersCount ? newBlock.getBlockchainHeadersCount() : 0;
                blockStatStream.write(`${Math.floor(new Date() / 1000)},${newBlock.getTimestamp()},${newBlock.getHeight()},${newBlock.getHash()},${newBlock.getDistance()},${newBlock.getDifficulty()},${newBlock.getTotalDistance()},${newBlock.getMiner().slice(2, 30)},${this._loggedBcBalances[newBlock.getMiner()]},${newBlock.getTxsList().length},${Math.round(newBlock.getNrgGrant())},${newBlocks}\n`);
              }
            }
            this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, newBlock.getHash());
            this._knownFullBlocksCache.set(newBlock.getHash(), newBlock);

            process.nextTick(async () => {
              await this.miningOfficer.newRoveredBlock(roverList, false, this._blockCache, true, this._knownFullBlocksCache);
            });

            this.pubsub.publish('block.peer', {
              type: 'block.peer',
              data: newBlock
            });
            // TODO: Dibsaled if (needsResync && iph === 'complete' && ipd === 'complete') {
          }

          if (needsResync && rangeRequest && rangeRequest.highestHeight) {
            //this._emitter.emit('collectBlock', { block: newBlock })
            debug(`range request highest height: ${rangeRequest.highestHeight} lowest height: ${rangeRequest.lowestHeight}`);
            this._asyncEmitter.emit('requestBlockRange', [rangeRequest.highestHeight, rangeRequest.lowestHeight, conn]);
            return;
          }
        } else {
          //
          //
          //  OVERLINE USE
          //  complete the partial block
          //
          //
          this._logger.info('no full block found');
          const { stored, needsResync, rangeRequest, schedules, assertSyncComplete, blockSendingAlternative } = await this.multiverse.extendMultiverse(newBlock, 'peer', true, false, address);

          if (assertSyncComplete) {
            this.node.syncComplete = true;
          }

          // store any relavent block schedules to evaluate when/if that child chain block height is available
          if (schedules.length > 0) {
            await Promise.all(schedules.map((schedule, i) => {
              this._logger.info(`adding schedule ${i}`);
              return this.persistence.scheduleAtBlockHeight(schedule[0], schedule[1], schedule[2], schedule[3], schedule[4]);
            }));
          }

          if (needsResync && rangeRequest && rangeRequest.highestHeight) {
            this._asyncEmitter.emit('requestBlockRange', [rangeRequest.highestHeight, rangeRequest.lowestHeight]);
          }

          const request = { dimension: 'hash', id: newBlock.getHash(), connection: conn };
          this._emitter.emit('getTxs', request);
          // make sure IPH and IPD are complete before asking for sets to catch up
          resyncFullNode = needsResync && iph === 'complete' && ipd === 'complete';
          resyncTestNode = DISABLE_IPH_TEST && rangeRequest && rangeRequest.highestHeight;
          if (resyncTestNode || resyncFullNode) {
            if (latestBlock !== null) {
              const diff = new BN(parseInt(newBlock.getHeight(), 10)).sub(new BN(parseInt(latestBlock.getHeight(), 10)).sub(new BN(1))).toNumber();
              const high = parseInt(newBlock.getHeight(), 10);
              const low = new BN(parseInt(newBlock.getHeight(), 10)).sub(new BN(diff)).toNumber();
              //this._logger.info(`requesting GET_BLOCKS from peer low: ${low} high: ${high} diff: ${diff}`)
              debug(`passing block to multiverse.extendMultiverse ${newBlock.getHeight()} : ${newBlock.getHash()} iph: ${iph} ipd: ${ipd}`);
              //this._logger.info(`new ${fullBlock ? 'full ' : ''}block ${stored ? 'NOT ' : ''}stored ${newBlock.getHeight()}`)

              if (stored) {

                if (!needsResync) {
                  this.node.broadcastNewBlock(newBlock);
                  rebaseWorkers();
                  // immediately check if there is work available
                  process.nextTick(async () => {
                    await this.miningOfficer.newRoveredBlock(roverList, false, this._blockCache, true, this._knownFullBlocksCache);
                  });
                }
                this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, newBlock.getHash());
                // send partial block to other peers
                this._logger.info(`new Block from peer: ${newBlock.getHeight()}`);
                this.pubsub.publish('block.peer', {
                  type: 'block.peer',
                  data: newBlock
                });
              }

              debug(`blockFromPeer() iph: ${iph} ipd: ${ipd}`);
              // TODO: Dibsaled if (needsResync && iph === 'complete' && ipd === 'complete') {
              if (needsResync && iph === 'complete' && ipd !== 'pending') {
                const getBlockListMessage = {
                  data: {
                    high: newBlock.getHeight(),
                    low: new BN(latestBlock.getHeight()).sub(new BN(6)).toNumber()
                  },
                  connection: conn
                };
                this._emitter.emit('getblocklist', getBlockListMessage);
              } else if (needsResync) {
                debug(`ignored resync from multiverse IPH: ${iph} IPD: ${ipd}`);
              }
            }
          } else {
            // get a full block
            const request = { dimension: 'hash', id: newBlock.getHash(), connection: conn };
            this._emitter.emit('getTxs', request);
            //this._logger.info(`new ${fullBlock ? 'full ' : ''}block ${stored ? 'NOT ' : ''}stored ${newBlock.getHeight()}`)
            // make sure IPH and IPD are complete before asking for sets to catch up
            if (needsResync && iph === 'complete' && ipd !== 'pending') {
              this.persistence.get('bc.block.latest').then(latestBlock => {
                if (latestBlock !== null) {
                  const getBlockListMessage = {
                    data: {
                      high: newBlock.getHeight(),
                      low: new BN(latestBlock.getHeight()).sub(new BN(6)).toNumber()
                    },
                    connection: conn
                  };
                  this._emitter.emit('getblocklist', getBlockListMessage);
                } else {
                  this._logger.error(new Error('critical error: unable to get bc.block.latest <- all super collider nodes will be vulnerable'));
                }
              }).catch(err => {
                this._logger.error(err);
              });
            }
          }
        }
      } else {
        this._logger.info(`newBlock already in cache ${newBlock.getHash()}`);
      }
    });

    this.workerPool.allRise({ minerKey: this._minerKey, emblemPerformance: this._emblemPerformance }).then(() => {

      this._emitter.on('announceMinedBlock', async ({ unfinishedBlock, solution }) => {

        this._processMinedBlock(unfinishedBlock, solution).then(async res => {
          if (res === true) {

            const newBlock = unfinishedBlock;

            if (BC_LOG_BLOCK_STATS) {
              if (this._loggedBcBlocks.indexOf(newBlock.getHash()) < 0) {
                this._loggedBcBlocks.push(newBlock.getHash());
                if (!this._loggedBcBalances[newBlock.getMiner()]) {
                  this._loggedBcBalances[newBlock.getMiner()] = Math.round(newBlock.getNrgGrant());
                } else {
                  this._loggedBcBalances[newBlock.getMiner()] += Math.round(newBlock.getNrgGrant());
                }
              }
              const newBlocks = newBlock.getBlockchainHeadersCount ? newBlock.getBlockchainHeadersCount() : 0;
              blockStatStream.write(`${Math.floor(new Date() / 1000)},${newBlock.getTimestamp()},${newBlock.getHeight()},${newBlock.getHash()},${newBlock.getDistance()},${newBlock.getDifficulty()},${newBlock.getTotalDistance()},${newBlock.getMiner().slice(2, 30)},${this._loggedBcBalances[newBlock.getMiner()]},${newBlock.getTxsList().length},${Math.round(newBlock.getNrgGrant())},${newBlocks}\n`);
            }
            // set the block in the local cache
            this._knownBlocksCache.set(newBlock.getHash(), true);
            this._knownFullBlocksCache.set(newBlock.getHash(), newBlock);

            return this._broadcastMinedBlock(unfinishedBlock, solution).then(async res => {
              debug(`broadcast is complete`);
            }).catch(err => {
              this._logger.error(`mined block broadcast failed -> ${err.message}`);
            });
          } else {
            debug(`yielding block ${unfinishedBlock.getHeight()} broadcasted to network`);
          }
        }).catch(err => {
          this._logger.warn(err);
        });
      });

      this._emitter.on('requestRoverRange', async data => {
        if (!data) {
          return;
        }
        const { rover, highest, lowest } = data;
        //const rangeRequest = this._chainState.openBlockRangeRequest(rover, highest, lowest)
        const now = Date.now();
        const requiredBlockCount = Math.floor(ROVER_RESYNC_PERIOD / ROVER_SECONDS_PER_BLOCK[rover]);
        let dataLatestStr = await this.persistence.get(`${rover}.data.latest`);
        let lowestHeight = false;
        let makeRequest = true;
        if (dataLatestStr === null) {
          await this.persistence.put(`${rover}.data.latest`, `${lowest}:${now}`);
        } else {
          let prevTime = parseInt(dataLatestStr.split(':')[1], 10) + 5000;
          lowestHeight = parseInt(dataLatestStr.split(':')[0], 10);
          if (lowestHeight < lowest || prevTime < now) {
            this._logger.info(`new higher threshold, ${rover} moving to ${lowest}`);
            await this.persistence.put(`${rover}.data.latest`, `${lowest}:${now}`);
          } else {
            this._logger.info(` ${rover} rover threshold searching for ${lowestHeight}, yielding request for ${lowest}`);
            makeRequest = false;
          }
        }

        if (makeRequest) {
          this._logger.info(`direct range request rover ${rover} from: ${lowest},  to: ${highest}`);
          const msg = new RoverMessage();
          const blockRangePayload = new RoverMessage.RoverBlockRange();
          blockRangePayload.setRoverName(rover);
          blockRangePayload.setHighestHeight(highest);
          blockRangePayload.setLowestHeight(lowest);
          blockRangePayload.setSynced(false);
          msg.setType(RoverMessageType.ROVER_BLOCK_RANGE);
          msg.setRoverBlockRange(blockRangePayload);
          this._rovers.messageRover(data.rover, 'open_block_range_request', msg);
        }
      });

      this._emitter.on('roverSyncStatus', msg => {
        if (this._chainState) {
          this._chainState.putSyncStatus(msg.rover, msg.status);
        }
      });

      this._emitter.on('roverBlockRange', async roverRange => {
        /*
         * range protobuf
         *  getRoverName
         *  getHighestHeight
         *  getLowestHeight
         *  getHighestHash
         *  getLowestHash
         */
        const rover = roverRange.getRoverName();
        const allRoversHaveSufficientBlocks = this._miningOfficer._knownRovers.reduce((state, chain) => {
          if (state) {
            const minBlockCount = Math.floor(ROVER_RESYNC_PERIOD / ROVER_SECONDS_PER_BLOCK[chain]);
            return this._miningOfficer._collectedBlocks[chain] && this._miningOfficer._collectedBlocks[chain] > minBlockCount && this._miningOfficer._collectedBlocks[chain] > 1;
          } else {
            return false;
          }
        }, true);
        const requiredBlockCount = Math.floor(ROVER_RESYNC_PERIOD / ROVER_SECONDS_PER_BLOCK[rover]);
        const roverHasSufficientBlocks = this._miningOfficer._collectedBlocks[rover] && this._miningOfficer._collectedBlocks[rover] > requiredBlockCount && this._miningOfficer._collectedBlocks[rover] > 1;
        const currentLatestBlock = await this.persistence.get(`${rover}.block.latest`);

        try {
          if (!roverRange || !roverRange.getRoverName) {
            this._logger.warn('rover range recieved in engine is malformed');
            return;
          }

          // determine if this is an event from the BC p2p module
          if (roverRange.getRoverName() === 'bc') {
            // the rover range to be evaluated is from the BC p2p module
            try {
              const confirmations = ROVER_CONFIRMATIONS[rover] || 8;
              const missingBlocks = await this._persistence.getMissingBlocks(rover, roverRange.getLowestHeight(), roverRange.getHighestHeight(), confirmations);
              const rangeRequest = this._chainState.closeBlockRangeRequest(rover, roverRange, missingBlocks);
              const { highestHeight, lowestHeight, highestHash, lowestHash } = rangeRequest;
              if (rangeRequest.notifyRover) {
                this._node.setBlockRange([highestHeight, lowestHeight], [highestHash, lowestHash]);
              } else {
                // apply reorg
                const block = await this.persistence.getBlockByHash(highestHash, rover);
              }
            } catch (err) {
              this._logger.error(err);
            }
          } else if (this._rovers._roverSyncStatus[rover] === true && roverHasSufficientBlocks) {
            // the rover range to be evaluated is from the Rovers
            // LDL
            debug(`rover ${roverRange.getRoverName()} close block range claim received ${roverRange.getHighestHeight()} ${roverRange.getRoverName()} - ${roverRange.getLowestHeight()} ${roverRange.getRoverName()}`);
            const rover = roverRange.getRoverName();
            const confirmations = ROVER_CONFIRMATIONS[rover] || 8;
            const areRoversSynced = await this.persistence.isBlockchainSynced(rover, {
              givenLowestHeight: this._chainState.getRangeLowestHeight(rover),
              givenHighestHeight: this._chainState.getLatestBlockHeight(rover),
              returnRangeIfMissing: true,
              chainState: this._chainState
            });
            let missingBlocks = [];
            // LDL
            debug(`rover ${roverRange.getRoverName()} about to run close block missingBlocks BEFORE are rovers synced : ${missingBlocks.length}`);
            let s = true;
            if (!areRoversSynced) {
              s = false;
            } else if (areRoversSynced.length > 0) {
              s = false;
              missingBlocks = missingBlocks.concat(areRoversSynced);
            }
            // LDL
            debug(`rover ${roverRange.getRoverName()} about to run close block range claim with missingBlocks: ${missingBlocks.length}, confirmations: ${confirmations} s: ${s} printing are rovers synced`);
            const rangeRequest = this._chainState.closeBlockRangeRequest(rover, roverRange, missingBlocks);
            const { highestHeight, lowestHeight, highestHash, lowestHash } = rangeRequest;
            if (rangeRequest.notifyRover && !s && parseInt(currentLatestBlock.getHeight(), 10) < highestHeight) {
              const msg = new RoverMessage();
              const blockRangePayload = new RoverMessage.RoverBlockRange();

              blockRangePayload.setRoverName(rover);
              blockRangePayload.setHighestHeight(highestHeight);
              blockRangePayload.setLowestHeight(lowestHeight);
              blockRangePayload.setHighestHash(highestHash);
              blockRangePayload.setLowestHash(lowestHash);
              blockRangePayload.setSynced(s);

              msg.setType(RoverMessageType.ROVER_BLOCK_RANGE);
              msg.setRoverBlockRange(blockRangePayload);

              this._logger.info(`rover ${roverRange.getRoverName()} opened block range request ${highestHeight} ${rover} <- ${lowestHeight} ${rover}`);
              this._rovers.messageRover(rover, 'open_block_range_request', msg);
            } else if (highestHash && highestHeight) {
              const currentLatestBlockHeight = this._chainState.getLatestBlockHeight(rover);
              this._logger.info(`currentLatestBlockHeight: ${currentLatestBlockHeight} highestHeight: ${highestHeight}`);
              const block = await this.persistence.getBlockByHeight(highestHeight, rover);
              debug(`block range request already open ${highestHeight} ${rover} <- ${lowestHeight} ${rover}`);
              // conduct reorg
              //if (block && block.getHash() !== highestHash) {
              //  // LDL
              //  debug(`critical error block stored at height ${highestHeight} hash ${block.getHash()} does not equal range close request hash ${highestHash}`)
              //}
              if (block && new BN(block.getHeight()).gt(new BN(currentLatestBlockHeight))) {
                //
                // reput the block in case there are external operations to run
                //
                if (rover !== 'bc') {
                  this.miningOfficer._collectedBlocks[rover] += 1;
                }
              }
            }
          }
        } catch (err) {
          this._logger.error(err);
        }
        // this._chainState.printState()
      });

      this._roverEmitter.on('collectBlock', async ({
        block
      }) => {
        try {
          // Persist block if needed
          if (PERSIST_ROVER_DATA === true) {
            this._writeRoverData(block);
          }

          // if a block is recieved from rover set connection sync status to true (this is only means the rover is recieving updates from it's respective network and not that the local blockchain is 'synced')
          if (!block || !block.getPreviousHash) {
            this._logger.warn(`malformed hash`);
            return;
          }

          const blockExtendsChain = this.multiverse.blockExtendsChain(block);
          const rover = block.getBlockchain ? block.getBlockchain().toLowerCase() : BC_SUPER_COLLIDER;
          const requiredBlockCount = Math.floor(ROVER_RESYNC_PERIOD / ROVER_SECONDS_PER_BLOCK[rover]);
          const latestBlockHeight = this._chainState.getLatestBlockHeight(rover);
          const blockHeight = block.getHeight();
          const blockHash = block.getHash();
          const blockPreviousHash = block.getPreviousHash();
          const roverHasSufficientBlocks = this._miningOfficer._collectedBlocks[rover] && new BN(this._miningOfficer._collectedBlocks[rover]).gte(new BN(requiredBlockCount)) && this._miningOfficer._collectedBlocks[rover] !== 0;
          const cacheKey = `${rover}:${blockHash}`;
          let roverLatestBlock = await this.persistence.get(`${rover}.block.latest`);

          if (this._chainState) {
            this._chainState.putSyncStatus(rover, true);
          }
          debug(`current latest block height: ${latestBlockHeight}`);
          debug(`given block height: ${blockHeight}`);

          const allRoversHaveSufficientBlocks = this._miningOfficer._knownRovers.reduce((roverState, chain) => {
            if (roverState) {
              const minBlockCount = Math.floor(ROVER_RESYNC_PERIOD / ROVER_SECONDS_PER_BLOCK[chain]);
              return this._miningOfficer._collectedBlocks[chain] && this._miningOfficer._collectedBlocks[chain] > minBlockCount && this._miningOfficer._collectedBlocks[chain] > 1;
            } else {
              return false;
            }
          }, true);

          if (!allRoversHaveSufficientBlocks) {
            this._miningOfficer.printState();
          }

          if (this._knownBlocksCache.has(cacheKey)) {
            debug(`block from rover already processed`);
            return;
          } else {
            this._knownBlocksCache.set(cacheKey, true);
          }

          // lite check to determine if ths block is the immediate next block, requires access to persistence for full check
          for (let key of this._knownRovers) {
            if (key !== BC_SUPER_COLLIDER) {
              const reqCountBlock = Math.floor(ROVER_RESYNC_PERIOD / ROVER_SECONDS_PER_BLOCK[key]);
              if (this._miningOfficer._collectedBlocks[key] && new BN(this._miningOfficer._collectedBlocks[key]).lt(new BN(reqCountBlock))) {
                this._rovers._roverSyncStatus[key] = false;
              } else {
                this._rovers._roverSyncStatus[key] = true;
              }
            }
          }

          if (rover !== BC_SUPER_COLLIDER) {
            const report = await this.persistence.putBlock(block, 0, rover, { rovered: true });
            if (report && report.purgeBlocksTo) {
              /*
               *   dont accept bad marked txs in blocks
               */
              rebaseWorkers();
              const safeRoverBlock = await this.persistence.getBlockByHash(report.purgeBlocksTo, rover, { cached: false });
              if (safeRoverBlock) {
                const safeBlockHashes = await this.persistence.getRootedBlockFromBlock(safeRoverBlock, [], { returnParents: true });
                if (safeBlockHashes && safeBlockHashes.length > 0) {
                  const safeHash = last(safeBlockHashes);
                  const safeBlock = await this.persistence.getBlockByHash(safeHash, BC_SUPER_COLLIDER, { cached: false });
                  const latestBlock = await this.persistence.get(`${BC_SUPER_COLLIDER}.block.latest`);
                  if (safeBlock && latestBlock) {
                    rebaseWorkers();
                    this._logger.info(`moving to secure block at ${BC_SUPER_COLLIDER} ${safeBlock.getHeight()} : ${safeBlock.getHash()}`);
                    await this.persistence.put(`${BC_SUPER_COLLIDER}.block.reorgfrom`, safeBlock);
                    await this.persistence.put(`${BC_SUPER_COLLIDER}.block.reorgto`, latestBlock);
                    await this.persistence.put(`${BC_SUPER_COLLIDER}.sync.initialsync`, 'pending');
                    await this.persistence.reorgBlockchain(BC_SUPER_COLLIDER, { force: true, iterateUp: false });
                  } else {
                    await this.forceExit();
                  }
                } else {
                  await this.forceExit();
                }
              } else {
                await this.forceExit();
              }
            }
          }

          if (!roverLatestBlock) {
            roverLatestBlock = await this.persistence.putLatestBlock(block, rover, { chainState: this._chainState });
          } else if (roverLatestBlock && block && parseInt(roverLatestBlock.getHeight(), 10) < parseInt(block.getHeight(), 10)) {
            roverLatestBlock = await this.persistence.putLatestBlock(block, rover, {
              chainState: this._chainState,
              iterateUp: true
            });
          } else if (roverLatestBlock && block && parseInt(roverLatestBlock.getHeight(), 10) === parseInt(block.getHeight(), 10) && roverLatestBlock.getHash() !== block.getHash()) {
            roverLatestBlock = await this.persistence.putLatestBlock(block, rover, {
              chainState: this._chainState,
              iterateUp: true
            });
          } else if (!roverLatestBlock && block) {
            roverLatestBlock = await this.persistence.putLatestBlock(block, rover, {
              chainState: this._chainState,
              iterateUp: true
            });
          }

          const hasMount = await this.persistence.getBlockByHash(block.getPreviousHash(), block.getBlockchain());
          const compressed = await this.multiverse.compressMultiverse(block, this._txPendingPool);

          if (blockExtendsChain || roverLatestBlock.getHash() === block.getHash() || hasMount || roverLatestBlock.getPreviousHash() === block.getPreviousHash()) {

            debug(`${rover} block ${block.getHeight()} EXTENDS local blockchain ${rover} of hash ${blockHash.slice(0, 21)}`);

            if (rover !== 'bc') {
              this.miningOfficer._collectedBlocks[rover] += 1;
            }

            // if the rovers sync status is true confirm this chain is synced and pass to the mining officer
            if (this._rovers._roverSyncStatus[rover] === true && roverHasSufficientBlocks) {

              const areRoversSynced = await this.persistence.isBlockchainSynced(rover, {
                givenLowestHeight: this._chainState.getRangeLowestHeight(rover),
                givenHighestHeight: new BN(roverLatestBlock.getHeight()).toNumber(),
                returnRangeIfMissing: true,
                chainState: this._chainState
              });
              let s = true;
              if (!areRoversSynced) {
                s = false;
              } else if (areRoversSynced.length > 0) {
                s = false;
              }

              if (s) {
                //const syncComplete = this.node._discovery.connected < 2 ? true : this.node._syncComplete
                const syncComplete = true;
                const roversClaimToBeSynced = this._rovers.areRoversSynced() && syncComplete && roverHasSufficientBlocks && allRoversHaveSufficientBlocks;
                debug(`latest block from ${rover} rover stored and local chain is synced -> all rovers reporting synced: ${roversClaimToBeSynced}`);
                const v = values(this._rovers._roverSyncStatus);
                const allClaimSync = v.reduce((all, mv) => {
                  if (all) {
                    if (mv !== all) {
                      return false;
                    }
                  }
                  return all;
                }, true);
                debug(`rovers reporting ${v.length}/${this._knownRovers.length}, link assertion: ${allClaimSync}, all rovers have sufficient blocks ${allRoversHaveSufficientBlocks}`);
                if (allClaimSync === true && roversClaimToBeSynced === true) {
                  if (BC_BUILD_GENESIS) {
                    await this.persistence.put(`${BC_SUPER_COLLIDER}.sync.initialsync`, 'complete');
                  }
                  const fullBlockCache = roversClaimToBeSynced ? this._knownFullBlocksCache : false;
                  this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, block.getHash());
                  this.miningOfficer._cleanUnfinishedBlock();
                  if (BC_MINER_WORKERS < 1) {
                    rebaseWorkers();
                  } else {
                    try {
                      await this._workerPool._sendMessage({ type: 'segment' });
                    } catch (e) {
                      this._logger.error(e.message);
                      rebaseWorkers();
                    }
                  }
                  const pid = await this.miningOfficer.newRoveredBlock(rovers, block, this._blockCache, roversClaimToBeSynced, fullBlockCache);
                  if (pid !== false) {
                    debug(`collectBlock handler: sent to miner`);
                    return;
                  }
                } else if (!syncComplete) {
                  this._logger.info(`syncing multiverse...`);
                } else {
                  //this._logger.info(JSON.stringify(this._rovers._roverSyncStatus))
                }
                return;
              }
              if (areRoversSynced.length > 0) {
                debug(`latest block from ${rover} rover stored and chain is NOT synced`);
                const lowest = areRoversSynced[0];
                const highest = areRoversSynced[areRoversSynced.length - 1];
                const rangeRequest = this._chainState.openBlockRangeRequest(rover, highest, lowest, { missingBlocks: areRoversSynced });

                if (rangeRequest.notifyRover && roverHasSufficientBlocks) {

                  const msg = new RoverMessage();
                  const blockRangePayload = new RoverMessage.RoverBlockRange();
                  const { highestHeight, lowestHeight, highestHash, lowestHash } = rangeRequest;
                  if (new BN(highestHeight).gt(new BN(lowestHeight))) {

                    blockRangePayload.setRoverName(rover);
                    // set highest height to the given range request
                    blockRangePayload.setHighestHeight(highest);
                    // set lowest height to the chain states highest
                    blockRangePayload.setLowestHeight(lowest);
                    blockRangePayload.setSynced(s);

                    msg.setType(RoverMessageType.ROVER_BLOCK_RANGE);
                    msg.setRoverBlockRange(blockRangePayload);

                    debug(`opened block range request ${highest} ${rover} <- ${lowest} ${rover} (${highest - lowest} blocks)`);
                    this._rovers.messageRover(rover, 'open_block_range_request', msg);
                  } else {
                    this._logger.info(`highest height ${highestHeight} < lowest height ${lowestHeight}`);
                  }
                }
              } else {
                debug(`chain state is complete for ${rover} rover`);
              }
            }
            return;

            // the block is not considered the net block, if the rover believes it is synced determine if a request must be opened
          } else if (this._rovers._roverSyncStatus[rover] === true && roverHasSufficientBlocks) {

            let opts = {};

            // store the block regardless and this block is not connected do not run any scheduled operations

            if (rover !== 'bc') {
              this.miningOfficer._collectedBlocks[rover] += 1;
            }

            let evaluateRange = [];

            // check with chainstate for the current highest set block
            const currentBlockHighest = this._chainState.getRangeHighestHeight(rover);
            if (currentBlockHighest) {
              evaluateRange.push(currentBlockHighest);
            }

            // check with chainstate for the current lowest set block
            const currentBlockLowest = this._chainState.getRangeLowestHeight(rover);
            if (currentBlockLowest) {
              evaluateRange.push(currentBlockLowest);
            }

            // at the given block height to the evaluation range
            evaluateRange.push(blockHeight);

            const latestBlockHeight = this._chainState.getLatestBlockHeight(rover);
            const latestBlockHash = this._chainState.getLatestBlockHash(rover);
            const lowestBlockHash = this._chainState.getRangeLowestHash(rover);
            const lowestBlockHeight = this._chainState.getRangeLowestHeight(rover);

            if (latestBlockHeight === blockHeight) {
              this._logger.warn(`storing but not evaluting block given at height ${latestBlockHeight} as it matches the latest block height`);
              return;
            }
            debug(`evaluating given block ${blockHeight} references previous hash ${blockPreviousHash} with latest block ${latestBlockHeight} whose hash is ${latestBlockHash} current highest: ${currentBlockHighest} current lowest: ${currentBlockLowest}`);
            debug(`current block height ${block.getHeight()} with latest block height ${latestBlockHeight}`);
            let prevHeight = 1;
            let forceNotify = false;
            let nextHeight = block.getHeight();
            if (latestBlockHeight && latestBlockHeight !== parseInt(block.getHeight(), 10)) {
              if (new BN(block.getHeight()).gte(new BN(latestBlockHeight))) {
                debug('0000');
                const latestBlock = await this.persistence.get(`${rover}.block.latest`);
                //if (latestBlock) {
                //  // forces the chain walk to latest block height
                //  await this._persistence.putLatestBlock(block, rover, { chainState: this._chainState })
                //}
                if (!latestBlock) {
                  // DEBUG
                  debug(`1111`);
                  prevHeight = new BN(latestBlockHeight).toNumber();
                  nextHeight = block.getHeight();
                  evaluateRange.length = 0;
                  // DEBUG
                  debug(`pushing prevHeight: ${prevHeight}`);
                  debug(`pushing block.getHeight(): ${nextHeight}`);
                  evaluateRange.push(prevHeight); // prepare for reorgs
                  evaluateRange.push(block.getHeight()); // prepare for reorgs
                } else {
                  // DEBUG
                  debug(`2222 -> getRootBlockFrom() latestBlock: ${latestBlock.getHeight()} given block: ${block.getHeight()}`);
                  const rootBlock = await this.persistence.getRootBlockFromBranch(latestBlock, block);
                  // we do not have the blocks on disk to complete the higher block
                  // DEEBUG
                  debug(`about to print rootblock`);
                  debug(rootBlock && rootBlock.toObject ? rootBlock.toObject() : rootBlock);
                  if (!rootBlock && parseInt(block.getHeight(), 10) > parseInt(latestBlock.getHeight(), 10)) {
                    // DEBUG
                    debug(`3333`);
                    prevHeight = new BN(latestBlockHeight).sub(new BN(1)).toNumber();
                    debug(`pushing prevHeight: ${prevHeight}`);
                    debug(`pushing block.getHeight(): ${nextHeight}`);
                    this._logger.info(`seeking range size: ${nextHeight - prevHeight}`);
                    evaluateRange.length = 0;
                    evaluateRange.push(prevHeight); // prepare for reorgs
                    evaluateRange.push(parseInt(block.getHeight(), 10)); // prepare for reorgs
                  } else if (!rootBlock.getHash) {
                    // DEBUG
                    debug(`5555`);
                    // if the sequence is not available on disk it will give you the height to request
                    prevHeight = new BN(latestBlockHeight).sub(new BN(1)).toNumber();
                    const rootBn = rootBlock;
                    if (!isNaN(rootBn)) {
                      evaluateRange.length = 0;
                      evaluateRange.push(rootBn);
                      evaluateRange.push(nextHeight); // prepare for reorgs
                    }
                  } else if (new BN(latestBlockHeight).lt(new BN(block.getHeight())) && latestBlockHash !== block.getPreviousHash()) {
                    // TODO: !!! here role back the relevant !!!
                    // TODO: !!! reorg back to the root block !!!
                    this._logger.info(`multiverse change occured ${rover} ${block.getHeight()} from height ${latestBlockHeight}`);
                    // send to miner no need to notify rover as chain is on disk
                    if (this._chainState) {
                      this._chainState.putSyncStatus(rover, true);
                    }
                    //const syncComplete = this.node._discovery.connected < 2 ? true : this.node._syncComplete
                    const syncComplete = true;
                    const roversClaimToBeSynced = this._rovers.areRoversSynced() && syncComplete && allRoversHaveSufficientBlocks;
                    const v = values(this._rovers._roverSyncStatus);
                    const allClaimSync = v.reduce((all, mv, i) => {
                      if (all) {
                        if (mv !== all) {
                          return false;
                        }
                      }
                      return all;
                    }, true);
                    this._logger.info(`rovers reporting ${v.length}/${this._knownRovers.length}, link assertion: ${allClaimSync}, all rovers have sufficient blocks ${allRoversHaveSufficientBlocks}`);
                    if (allClaimSync && roversClaimToBeSynced) {
                      if (BC_BUILD_GENESIS) {
                        await this.persistence.put(`${BC_SUPER_COLLIDER}.sync.initialsync`, 'complete');
                      }
                      const fullBlockCache = roversClaimToBeSynced ? this._knownFullBlocksCache : false;
                      this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, block.getHash());
                      this.miningOfficer._cleanUnfinishedBlock();
                      if (BC_MINER_WORKERS < 1) {
                        rebaseWorkers();
                      } else {
                        try {
                          await this._workerPool._sendMessage({ type: 'segment' });
                        } catch (e) {
                          this._logger.error(e.message);
                          rebaseWorkers();
                        }
                      }
                      const pid = await this.miningOfficer.newRoveredBlock(rovers, block, this._blockCache, roversClaimToBeSynced, fullBlockCache);
                      return;
                    } else if (!syncComplete) {
                      this._logger.info(`syncing multiverse...`);
                      return;
                    } else {
                      //this._logger.info(JSON.stringify(this._rovers._roverSyncStatus))
                      return;
                    }
                  }
                }
              } else if (new BN(block.getHeight()).gt(new BN(latestBlockHeight))) {
                debug(`6666 given block ${block.getHeight()} is higher than ${latestBlockheight}`);
                prevHeight = new BN(latestBlockHeight).sub(new BN(1)).toNumber();
                evaluateRange.push(prevHeight); // prepare for reorgs
                evaluateRange.push(latestBlockHeight);
              }
            }

            // assert only numbers in the array
            evaluateRange = evaluateRange.filter(e => {
              if (!isNaN(e)) {
                return e;
              }
            });

            // there must be more than 1 items to establish range
            if (evaluateRange.length > 1) {
              try {
                /*
                    const rangeRequest = {
                      highestHeight: false,
                      lowestHeight: false,
                      highestHash: false,
                      lowestHash: false,
                      notifyRover: false
                    }
                 */
                debug(`${evaluateRange.length} available <- ${evaluateRange}`);

                let s = true;
                evaluateRange.sort((a, b) => {
                  if (a > b) {
                    return 1;
                  }
                  if (a < b) {
                    return -1;
                  }
                  return 0;
                });

                const areRoversSynced = await this.persistence.isBlockchainSynced(rover, {
                  givenLowestHeight: this._chainState.getRangeLowestHeight(rover),
                  givenHighestHeight: new BN(latestBlockHeight).toNumber(),
                  returnRangeIfMissing: true,
                  chainState: this._chainState
                });
                if (!areRoversSynced) {
                  s = false;
                } else if (areRoversSynced.length > 1) {
                  s = false;
                  debug(`adding synced range to evaluate complete range ${JSON.stringify(evaluateRange, null, 2)} + ${JSON.stringify(areRoversSynced, null, 2)}`);
                  evaluateRange = evaluateRange.concat(areRoversSynced);
                }

                evaluateRange = uniq(evaluateRange);
                evaluateRange.sort((a, b) => {
                  if (a > b) {
                    return 1;
                  }
                  if (a < b) {
                    return -1;
                  }
                  return 0;
                });

                let lowest = evaluateRange[0];
                const highest = evaluateRange[evaluateRange.length - 1];
                const highestHash = parseInt(block.getHeight(), 10) === highest ? block.getHash() : this._chainState.getRangeHighestHash(rover);
                const lowestHash = parseInt(block.getHeight(), 10) === lowest ? block.getHash() : this._chainState.getRangeLowestHash(rover);
                const currentLowest = this._chainState.getRangeLowestHeight(rover);
                const syncComplete = true;
                const roversClaimToBeSynced = this._rovers.areRoversSynced() && syncComplete && allRoversHaveSufficientBlocks;
                const v = values(this._rovers._roverSyncStatus);
                const allClaimSync = v.reduce((all, mv) => {
                  if (all) {
                    if (mv !== all) {
                      return false;
                    }
                  }
                  return all;
                }, true);
                // DEBUG
                debug(`evaluating ${rover} block heights lowest: ${lowest} to highest: ${highest}`);
                if (s && new BN(block.getHeight()).lt(new BN(latestBlockHeight)) && roversClaimToBeSynced && allClaimSync) {
                  debug(`ignoring given block ${block.getHeight()} is below latest ${latestBlockHeight} and status of rover is synced, lowest ${lowest} <> latest block height ${latestBlockHeight}`);
                  const fullBlockCache = roversClaimToBeSynced ? this._knownFullBlocksCache : false;
                  this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, block.getHash());
                  this.miningOfficer._cleanUnfinishedBlock();
                  if (BC_MINER_WORKERS < 1) {
                    rebaseWorkers();
                  } else {
                    try {
                      await this._workerPool._sendMessage({ type: 'segment' });
                    } catch (e) {
                      this._logger.error(e.message);
                      rebaseWorkers();
                    }
                  }
                  const pid = await this.miningOfficer.newRoveredBlock(rovers, block, this._blockCache, roversClaimToBeSynced, fullBlockCache);
                  return;
                }

                const rangeRequest = this._chainState.openBlockRangeRequest(rover, highest, lowest, {
                  highestHash,
                  lowestHash,
                  missingBlocks: areRoversSynced
                });
                debug(`areRoversSynced === ${areRoversSynced}`);
                debug(`s === ${s} ---  1111 --- forceNotify: ${forceNotify} --- s: ${s} --- rangeRequest: ${rangeRequest.notifyRover}`);

                if (s && new BN(lowest).lt(new BN(currentLowest)) && currentLowest !== latestBlockHeight) {
                  debug(`updated chainstate with given block height ${block.getHeight()} with lowest: ${lowest} and highest: ${highest} evaluation is continuing...`);
                }

                debug(`blockchain: ${rover} notifications for rover: ${rangeRequest.notifyRover} , are rovers synced: ${areRoversSynced}`);

                if (rangeRequest.notifyRover && this._rovers._roverSyncStatus[rover] === true && parseInt(block.getHeight(), 10) > parseInt(latestBlockHeight, 10)) {

                  let requestHighest = highest;
                  let requestLowest = lowest;
                  const msg = new RoverMessage();
                  const blockRangePayload = new RoverMessage.RoverBlockRange();
                  const { highestHeight, lowestHeight, highestHash, lowestHash } = rangeRequest;

                  if (new BN(highestHeight).gt(new BN(lowestHeight))) {

                    if (highest !== highestHeight) {
                      this._logger.warn(`highest height: ${highest} has overridden Chain State to -> ${highestHeight}`);
                    }
                    const latestRoveredHeadersKeys = [range(lowest, highestHeight).map(height => `${rover}.block.${height}`)];
                    const latestBlockHeaders = await this.persistence.getBulk(latestRoveredHeadersKeys);

                    if (latestBlockHeaders) {
                      if (latestRoveredHeadersKeys && latestRoveredHeadersKeys.length === latestBlockHeaders.length) {
                        this._logger.warn(`highest height: ${highest} request overridden -> as ${highestHeight}`);
                        return;
                      }
                      debug(`latest rovered header keys: ${latestRoveredHeadersKeys.length} lowest: ${latestBlockHeaders[0].getHeight()}, highest: ${latestBlockHeaders[latestBlockHeaders - 1].getHeight()}`);
                    }

                    debug(`opened block range request highest: ${highest} lowest: ${lowest} highestHeight: ${highestHeight}\nhighestHash: ${highestHash} lowestHeight:${lowestHeight} lowestHash:${lowestHash}`);
                    blockRangePayload.setRoverName(rover);
                    // set highest height to the given range request
                    blockRangePayload.setHighestHeight(highestHeight);
                    // set lowest height to the chain states highest
                    blockRangePayload.setLowestHeight(lowest);
                    blockRangePayload.setHighestHash(highestHash);
                    blockRangePayload.setLowestHash(lowestHash);
                    blockRangePayload.setSynced(s);

                    msg.setType(RoverMessageType.ROVER_BLOCK_RANGE);
                    msg.setRoverBlockRange(blockRangePayload);

                    this._rovers.messageRover(rover, 'open_block_range_request', msg);
                  } else {
                    this._logger.info(`highest height ${highestHeight} < lowest height ${lowestHeight}`);
                  }
                } else {

                  if (this._chainState) {
                    this._chainState.putSyncStatus(rover, true);
                  }
                }
              } catch (err) {
                this._logger.error(err);
              }
            } else {
              this._logger.info(`not enough points to evaluate range: ${evaluateRange}`);
              return;
            }
          } else {
            debug(`rover found ${rover} block ${blockHeight} : ${blockHash}`);

            if (rover !== 'bc') {
              this.miningOfficer._collectedBlocks[rover] += 1;
            }
          }
        } catch (err) {
          this._logger.error(err.stack);
          console.log(err);
        }
      });
      this._logger.info('mining controller initialized');
    }).catch(err => {
      this._logger.error(err);
      this._logger.error(new Error('critical error <- protocol shutdown in progress...'));
      this._rovers.killRovers();
      process.exit(3);
    });
  }

  async integrityCheck() {
    try {
      const firstBlock = await this.persistence.get('bc.block.1');
      if (!firstBlock) {
        throw new Error('Fallback to catch to reset first block and sync');
      }
      this._logger.info('chain integrity check running');
      const limit = await this.persistence.stepFrom('bc.block', 1);
      this._logger.info('chain integrity: ' + limit);
      await this.persistence.flushFrom('bc.block', limit);
      return Promise.resolve(limit);
    } catch (err) {
      this._logger.error(err);
      this._logger.warn('unable to use default for integrity check');
      try {
        await this.persistence.putBlock(getGenesisBlock());
        await this.persistence.flushFrom('bc.block', 1);
      } catch (err) {
        this._logger.error(err);
      }
      return Promise.resolve(1);
    }
  }

  /**
   * Takes a range of blocks and validates them against within the contents of a parent and child
   * TODO: Move this to a better location
   * @param blocks BcBlock[]
   */
  async syncSetBlocksInline(blocks, blockKey) {
    // TODO blockKey never used
    let valid = true;
    if (blocks.length < 100) {
      valid = await this.multiverse.validateBlockSequenceInline(blocks);
    }
    if (valid === false) {
      return Promise.reject(new Error('invalid sequence of blocks')); // Enabled after target
    }
    let tasks = [];
    if (blockKey === undefined) {
      tasks = blocks.map(item => this.persistence.putBlock(item));
    } else {
      tasks = blocks.map(item => this.persistence.put(blockKey + '.bc.block.' + item.getHeight(), item));
    }
    await Promise.all(tasks);
    return Promise.resolve(tasks.length);
  }

  async stepSyncHandler(msg) {
    let cancelSync = false;
    const now = Math.floor(Date.now() * 0.001);
    const { connection, data } = msg;

    // sync is complete emit event
    if (data.low.getHeight() < 3) {
      this._emitter.emit('synccomplete', true);
      this._stepSyncTimestamps.length = 0;
      await this.persistence.put('synclock', getGenesisBlock());
      return;
    }

    let previousTimestamp = now;
    if (this._stepSyncTimestamps.length > 0) {
      previousTimestamp = this._stepSyncTimestamps[this._stepSyncTimestamps.length - 1];
    }

    this._logger.info('sync request returned from peer in ' + (now - previousTimestamp) + ' seconds');
    await this.persistence.put('synclock', data.low);

    const high = max(3, parseInt(data.low.getHeight(), 10));
    const low = max(2, high - 500);
    const getBlockListMessage = {
      connection,
      data: {
        low: low,
        high: high
      }
    };
    if (cancelSync === false) {
      this._emitter.emit('getblocklist', getBlockListMessage);
    }
  }

  /**
   * New block range received from peer handler
   * @param conn Connection the block was received from
   * @param newBlock Block itself
   */
  async blockRangeFromPeer(conn, blocks) {
    const peerBlocksSorted = blocks.sort((a, b) => {
      if (parseInt(a.getHeight(), 10) > parseInt(b.getHeight(), 10)) {
        return -1;
      }
      if (parseInt(a.getHeight(), 10) < parseInt(b.getHeight(), 10)) {
        return 1;
      }
      return 0;
    });

    this._logger.info(`peer blocks low: ${peerBlocksSorted[0]} high: ${peerBlocksSorted[peerBlocksSorted.length - 1]}`);
    const newBlocksRange = await this.persistence.getBlocksByRangeCached(parseInt(peerBlocksSorted[0].getHeight(), 10), parseInt(peerBlocksSorted[peerBlocksSorted.length - 1]));

    this._logger.info(`${blocks.length} blocks sent from peer`);
    this._logger.info(`${newBlocksRange.length} blocks from local`);
    return true;
  }

  /**
   * New block received from peer handler
   * @param conn Connection the block was received from
   * @param newBlock Block itself
   */
  //async blockFromPeer (
  //  conn: Object,
  //  newBlock: BcBlock,
  //  options: { ipd: string, iph: string, fullBlock: bool, sendOnFail: bool, handleAsNewPeer: bool } = { handleAsNewPeer: false, ipd: 'pending', iph: 'pending', fullBlock: false, sendOnFail: true }
  //): void {
  //  return Promise.resolve(true)
  //}

  getMultiverseHandler(conn, newBlocks) {
    // TODO should stop mining
    // get the lowest of the current multiverse
    try {
      // REPLACE this.miningOfficer.stopMining(this._workerPool)
      this._logger.info('end mining');
      // FIXME this prevents incoming multiverse from peer to be ever handled
      return Promise.resolve(true);
    } catch (e) {
      this._logger.error(e);
    }

    if (newBlocks === undefined || newBlocks.length < 7) {
      this._logger.warn('incomplete multiverse proof');
      return Promise.resolve(true);
    }

    const sorted = sortBlocks(newBlocks, 'desc');
    const highestReceivedBlock = sorted[0];
    const highestBlock = this.multiverse.getHighestBlock();

    this._logger.info('comparable blocks: ' + sorted.length);
    this._logger.info(highestReceivedBlock.getHash() + ' height: ' + highestReceivedBlock.getHeight() + ' comparing with ' + highestBlock.getHash() + ' height: ' + highestBlock.getHeight());
    let receivedSameOrBetterMultiversePart = false;
    // means the newBlock is the newest best highest block
    if (highestBlock && highestBlock.getHash() === highestReceivedBlock.getHash()) {
      receivedSameOrBetterMultiversePart = true;
    } else if (highestBlock && sorted && sorted.length > 0) {
      // conanaOut
      receivedSameOrBetterMultiversePart = new BN(highestReceivedBlock.getTotalDistance()).gt(new BN(highestBlock.getTotalDistance()));
      receivedSameOrBetterMultiversePart || this._logger.info('purposed new block has lower total difficulty than current multiverse height');
    } else if (sorted.length < 6) {
      // XXX explain
      receivedSameOrBetterMultiversePart = true;
    }

    if (receivedSameOrBetterMultiversePart === true) {
      // overwrite current multiverse
      const hasBlock = this.multiverse.hasBlock(highestReceivedBlock);
      this._logger.info(highestReceivedBlock.getHash() + ' approved --> assigning as current multiverse');
      this.multiverse.purge();
      this.multiverse.blocks = sorted;
      this._logger.info('multiverse has been assigned');

      return this.syncSetBlocksInline(sorted).then(blocksStoredResults => {
        return this.persistence.put('bc.depth', highestReceivedBlock.getHeight()).then(() => {
          // if the block is already in the multiverse dont conduct a full sync
          if (hasBlock === false) {
            this._logger.info('legacy multiverse did not include current block');

            // determine if a sync is already in progress
            return this.multiverse.isSyncLockActive().then(lock => {
              if (lock === false) {
                this._logger.info('lock is set to false');
                return this.persistence.put('synclock', this.multiverse.getHighestBlock()).then(() => {
                  this._logger.info('synclock was set to ' + this.multiverse.getHighestBlock());
                  this.pubsub.publish('update.block.latest', {
                    key: 'bc.block.latest',
                    data: highestReceivedBlock,
                    force: true,
                    multiverse: this.multiverse.blocks,
                    childHeaders: {
                      btc: true,
                      eth: true,
                      neo: true,
                      lsk: true,
                      wav: true
                    }
                  });
                  this.node.broadcastNewBlock(highestReceivedBlock, conn);
                  this._logger.info('sync unlocked');
                  const lowestBlock = this.multiverse.getLowestBlock();
                  // dont have to sync
                  if (!lowestBlock || lowestBlock.getHeight() - 1 < 2) {
                    return Promise.resolve(true);
                  }

                  this._emitter.emit('getblocklist', {
                    data: {
                      low: max(2, highestReceivedBlock.getHeight() - 500),
                      high: max(3, highestReceivedBlock.getHeight())
                    },
                    connection: conn
                  });

                  return Promise.resolve(true);
                }).catch(e => {
                  this._logger.error(e);
                  return this.persistence.put('synclock', getGenesisBlock()).then(() => {
                    this._logger.info('sync reset');
                    return Promise.resolve(true);
                  }).catch(e => {
                    this._logger.error(e);
                    return Promise.resolve(true);
                  });
                });
              } else {
                this.pubsub.publish('update.block.latest', {
                  key: `${BC_SUPER_COLLIDER}.block.latest`,
                  data: highestReceivedBlock,
                  force: true,
                  multiverse: this.multiverse.blocks // TODO not used in handler
                });
                this._logger.info(`update latest block direct`);
                this.node.broadcastNewBlock(newBlock);
                return Promise.resolve(true);
              }
            }).catch(e => {
              this._logger.error(e);
              return Promise.reject(e);
            });
          } else {
            return this.persistence.put('synclock', getGenesisBlock()).then(() => {
              this._logger.info('sync reset');
              return Promise.resolve(true);
            });
          }
          // assign where the last sync began
        }).catch(e => {
          this._logger.error(errToString(e));
          return this.persistence.put('synclock', getGenesisBlock()).then(() => {
            this._logger.info('sync reset');
            return Promise.resolve(true);
          }).catch(e => {
            this._logger.error(e);
            return Promise.resolve(true);
          });
        });
      }).catch(e => {
        this._logger.error(e);
        return Promise.resolve(true);
      });
    } else {
      this._logger.info('resync conditions failed');
      return this.persistence.put('synclock', getGenesisBlock()).then(() => {
        this._logger.info('sync reset');
        return Promise.resolve(true);
      }).catch(e => {
        this._logger.error(e);
        return Promise.resolve(true);
      });
    }
  }

  async processTx(newTx, conn) {
    if (this._knownTxsCache.has(newTx.getHash())) return;
    try {
      const synced = await this.persistence.get(`${BC_SUPER_COLLIDER}.sync.initialsync`);
      if (synced && synced !== 'complete') {
        this._txPendingPool.tryAddingNewTx(newTx);
        this._asyncEmitter.emit('announceTx', {
          data: newTx,
          connection: conn
        });
        return { status: RpcTransactionResponseStatus.SUCCESS, txHash: newTx.getHash() };
      } else if (synced && synced === 'complete') {
        const validTx = await this._txHandler.isValidTx(newTx, {});
        if (validTx) {
          const wasAdded = this._txPendingPool.tryAddingNewTx(newTx);
          if (wasAdded) {
            this._asyncEmitter.emit('announceTx', {
              data: newTx,
              connection: conn
            });
            return { status: RpcTransactionResponseStatus.SUCCESS, txHash: newTx.getHash() };
          } else {
            return { status: RpcTransactionResponseStatus.FAILURE, error: 'Not accepted by TX mem pool' };
          }
        } else {
          return { status: RpcTransactionResponseStatus.FAILURE, error: 'Tx Is Invalid' };
        }
      } else {
        return { status: RpcTransactionResponseStatus.FAILURE, error: `Node is syncing` };
      }
    } catch (err) {
      this._logger.info(`Tx is invalid for reason ${err}`);
      return { status: RpcTransactionResponseStatus.FAILURE, error: `Tx is Invalid` };
    }
  }

  /**
   * Start Server
   *
   * @param opts Options to start server with
   */
  async startServer(opts) {
    await this.server.run(opts);
  }

  async forceExit() {
    this._logger.error(`malformed child block discovered ${block.getHeight()} : ${block.getHash()}`);
    this._logger.error(`local multiverse removed, chain to be rebuilt, exiting...`);
    await this.persistence.del(`${rover}.block.latest`);
    await this.persistence.del(`${BC_SUPER_COLLIDER}.block.latest`);
    setTimeout(() => {
      process.exit();
    }, 5000);
    await this.requestExit();
    process.exit();
  }

  requestExit() {
    ts.stop();
    if (this._chainState) {
      return Promise.all([rebaseWorkers(), rebasePool(), this._rovers.killRovers(), this.node._discovery.leave(this.node._discovery.hash)
      //this._chainState._memory._memory.close()
      ]);
    } else {
      return Promise.all([rebaseWorkers(), rebasePool(), this._rovers.killRovers()]);
    }
  }

  _writeRoverData(newBlock) {
    const dataPath = ensureDebugPath(`bc/rover-block-data.csv`);
    const rawData = JSON.stringify(newBlock);
    writeFileSync(dataPath, `${rawData}\r\n`, {
      encoding: 'utf8',
      flag: 'a'
    });
  }

  /**
   * Broadcast new block
   *
   * - peers
   * - pubsub
   * - ws
   *
   * This function is called by this._processMinedBlock()
   * @param newBlock
   * @param solution
   * @returns {Promise<boolean>}
   * @private
   */
  async _broadcastMinedBlock(newBlock, solution) {
    if (!newBlock) {
      return Promise.reject(new Error('cannot broadcast empty block'));
    }

    try {
      const frontendWsData = _extends({}, newBlock.toObject(), {
        iterations: solution.iterations,
        timeDiff: solution.timeDiff
      });

      this._knownBlocksCache.set(newBlock.getHash(), true);
      this._knownFullBlocksCache.set(newBlock.getHash(), newBlock);

      this.pubsub.publish('block.mined', {
        type: 'block.mined',
        data: frontendWsData
      });
      debug('broadcasting block challenge ' + newBlock.getHeight() + ' -> considered next block in current multiverse');
      this._logger.debug(`xxxxxx _broadcastMinedBlock before broadcast: getTxCount: ${newBlock.getTxCount()},  ${newBlock.getTxsList().length}`);
      this.node.broadcastNewBlock(newBlock);
      return Promise.resolve(true);
      // NOTE: Do we really need nested try-catch ?
    } catch (err) {
      return Promise.reject(err);
    }

    return Promise.resolve(true);
  }

  /**
   * Processess unfinished mined block after the solution is found
   *
   * @param newBlock
   * @param solution
   * @returns {Promise<boolean>} Promise indicating if the block was successfully processed
   * @private
   */
  async _processMinedBlock(newBlock, solution, innerCalls = 0) {
    // TODO: reenable this._logger.info(`Mined new block: ${JSON.stringify(newBlockObj, null, 2)}`)
    // Trying to process null/undefined block
    return new Promise(async (resolve, reject) => {
      try {
        if (newBlock === null || newBlock === undefined) {
          this._logger.warn('Failed to process work provided by miner');
          return Promise.resolve(false);
        }

        const alreadyExists = await this.persistence.get(`${BC_SUPER_COLLIDER}.block.latest`);
        if (parseInt(newBlock.getHeight(), 10) <= parseInt(alreadyExists.getHeight(), 10) && newBlock.getHash() !== alreadyExists.getHash() && parseInt(newBlock.getTimestamp(), 10) - 30 < parseInt(alreadyExists.getTimestamp(), 10)) {
          this._logger.info(`work is stale ${newBlock.getHeight()} timestamp: ${newBlock.getTimestamp()}, latest timestamp: ${alreadyExists.getTimestamp()}`);
          return Promise.resolve(false);
        }

        // confirm block serialized and deserializes
        const s = newBlock.serializeBinary();
        const e = encodeTypeAndData(MESSAGES.BLOCK, newBlock);
        const d = BcBlock.deserializeBinary(s);

        if (!s || !e || !d || !d.getHash) {
          this._logger.warn(`mined block malformed data structure`);
          return Promise.resolve(false);
        }

        const update = `${BC_SUPER_COLLIDER}.work -> ${newBlock.getHash()}`;
        this._chainState._memory.put(`${BC_SUPER_COLLIDER}.work`, newBlock.getHash());
        this._knownBlocksCache.set(newBlock.getHash(), true);
        debug(`submitting mined block to current multiverse, txs length: ${newBlock.getTxsList().length}`);

        this._node._SEEN_BLOCKS_MEMORY[parseInt(newBlock.getHeight(), 10)] = 1;
        this._node._SEEN_BLOCKS_MEMORY[newBlock.getHash()] = 1;

        // immediately check if there is work available
        process.nextTick(async () => {
          await this.miningOfficer.newRoveredBlock(rovers, false, this._blockCache, true, this._knownFullBlocksCache);
        });

        const { stored, needsResync, rangeRequest, schedules, assertSyncComplete, blockSendingAlternative } = await this.multiverse.extendMultiverse(newBlock, 'local', true);
        if (rangeRequest && rangeRequest.highestHeight) {
          this._logger.warn(`mined block ${newBlock.getHeight()} did not extend multiverse`);
          resolve(false);
        } else if (!stored && !needsResync) {
          this._logger.warn(`mined block ${newBlock.getHeight()} extends multiverse with invalid sequence`);
          rebaseWorkers();
          resolve(false);
        } else if (stored && !needsResync) {
          debug(`after addBlock, txs length: ${newBlock.getTxsList().length}, getTxCount: ${newBlock.getTxCount()}`);
          debug(`new mined block stored: ${stored}`);
          resolve(true);
        }
      } catch (err) {
        this._logger.error(err.message);
        reject(err);
      }
    });
  }
}

exports.Engine = Engine;
exports.default = Engine;