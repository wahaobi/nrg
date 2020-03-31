'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
/**
 * Copyright (c) 2017present, blockcollider.org developers, All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 */

const toObject = exports.toObject = obj => {
  if (!obj) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(o => toObject(o));
  }

  if (typeof obj === 'object') {
    if (obj.toObject) {
      return obj.toObject();
    }

    const keys = Object.keys(obj);
    return keys.reduce((acc, field) => {
      // $FlowFixMe
      acc[field] = toObject(obj[field]);
      return acc;
    }, {});
  }

  return obj;
};