/*

index.js - "gossipmonger-memory-storage": In-memory storage engine for Gossipmonger

The MIT License (MIT)

Copyright (c) 2013 Tristan Slominski

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

*/
"use strict";

var clone = require('clone'),
    events = require('events'),
    util = require('util');

var MemoryStorage = module.exports = function MemoryStorage (options) {
    var self = this;
    events.EventEmitter.call(self);

    options = options || {};

    self.storage = {};
    self.livePeersMap = {};
    self.deadPeersMap = {};
};

util.inherits(MemoryStorage, events.EventEmitter);

MemoryStorage.prototype.deadPeers = function deadPeers () {
    var self = this;

    var peers = Object.keys(self.deadPeersMap).map(function (deadPeerId) {
        return self.deadPeersMap[deadPeerId];
    });

    return peers;
};

/*
  * `id`: _String_ Id of peer to get.
  * Return: _Object_ Peer with given `id` or `undefined`.
*/
MemoryStorage.prototype.get = function get (id) {
    var self = this;

    return self.storage[id];
};

MemoryStorage.prototype.livePeers = function livePeers () {
    var self = this;

    var peers = Object.keys(self.livePeersMap).map(function (livePeerId) {
        return self.livePeersMap[livePeerId];
    });

    return peers;
};

/*
  * `id`: _String_ Id of peer to put.
  * `peer`: _Object_ Peer to put into storage.
*/
MemoryStorage.prototype.put = function put (id, peer) {
    var self = this;

    self.storage[id] = peer;
    if (peer.live) {
        self.livePeersMap[id] = peer;
        delete self.deadPeersMap[id];
    } else {
        self.deadPeersMap[id] = peer;
        delete self.livePeersMap[id];
    }
};