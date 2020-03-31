'use strict';

/*
 * Copyright (c) 2017-present, BlockCollider developers, All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 */

var SUPPORTED_OPCODES = {
  /* OP_MAKERCOLL - 7 args
   * [payment]
   * [amount]
   * [toMakerAddress]
   * [toChain]
   * [fromChain]
   * [toTakerAddress]
   * [fromTakerAddress]
   */
  'OP_MAKERCOLL': function (stack) {
    // TODO: Should be make protobuf
    if (stack.length !== 6) {
      return false;
    }
    var obj = {};
    obj.receivesUnit = stack.pop();
    obj.sendsUnit = stack.pop();
    obj.makerReceivesToAddress = stack.pop();
    obj.makerSendsFromAddress = stack.pop();
    obj.receivesToChain = stack.pop();
    obj.sendsFromChain = stack.pop();
    // obj.takerRecievesToAddress = stack.pop()
    // obj.takerSendsFromAddress = stack.pop()
    return obj;
  },
  /* OP_DEPSET - 3 args
   * [settlementHeight]
   * [depositHeight]
   * [shift]
   */
  'OP_DEPSET': function (stack) {
    // TODO: Should be make protobuf
    if (stack.length !== 4) {
      return false;
    }
    var obj = {};
    obj.settlement = stack.pop();
    obj.deposit = stack.pop();
    obj.shiftTaker = stack.pop();
    obj.shiftMaker = stack.pop();
    return obj;
  },
  /* OP_MARK - 3 args
   * [expire]
   * [blockchain]
   * [address]
   */
  'OP_MARK': function (stack) {
    // TODO: Should be make protobuf
    if (stack.length !== 3) {
      return false;
    }
    var obj = {};
    obj.expire = stack.pop();
    obj.blockchain = stack.pop();
    obj.address = stack.pop();
    return obj;
  }
};

var BeamConverter = {

  getOpcodeFromScript(opcode, script) {
    var pattern = opcode.toUpperCase();
    var obj = false;
    var tray = [];
    script.split(' ').forEach(chunk => {
      if (chunk.indexOf('OP_') > -1) {
        if (pattern === chunk && obj === false) {
          obj = [].concat(tray);
        }
        // reset the stack after every OP_CODE
        tray.length = 0;
      } else {
        tray.push(chunk);
      }
    });
    return obj;
  },

  supportedOpcode(opcode) {
    return !!SUPPORTED_OPCODES[opcode];
  },

  /*
   * Convert script to JSON
   */
  toJSON(opcode, script) {
    opcode = opcode.toUpperCase();
    if (!BeamConverter.supportedOpcode(opcode)) {
      return false;
    }

    var parsedArgs = [];
    if (Array.isArray(script)) {
      parsedArgs = script;
    } else {
      parsedArgs = BeamConverter.getOpcodeFromScript(opcode, script);
    }
    if (!parsedArgs) {
      return false;
    }
    return SUPPORTED_OPCODES[opcode](parsedArgs);
  }
};

module.exports = BeamConverter;