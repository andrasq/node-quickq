/**
 * multi-tenant fair-share job scheduler
 *
 *   - tasks within a type are run in arrival order
 *   - types are run proportionately to their fraction waiting, max 80%
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

module.exports = FairScheduler;

function FairScheduler( options ) {
    options = options || {};
    this.concurrency = options.concurrency > 0 ? options.concurrency : 10;
    this.maxTypeShare = options.maxTypeShare || 0.80;
    this.maxScanLength = options.maxScanLength || 1000;
    this.runningCount = 0;
    this.waitingCount = 0;
    this.typesCount = 0;
    this._waiting = {};
    this._running = {};
}

FairScheduler.prototype.waiting = function waiting( type ) {
    if (! (type in this._running)) {
        this.typesCount += 1;
        this._running[type] = 0;
        this._waiting[type] = 0;
    }
    this.waitingCount += 1;
    this._waiting[type] += 1;
}

// Job of type started, track jobs.
FairScheduler.prototype.start = function start( type ) {
    this.runningCount += 1;
    this._running[type] += 1;
    this.waitingCount -= 1;
    this._waiting[type] -= 1;
}

// Job of type finished, track jobs.
FairScheduler.prototype.done = function done( type ) {
    this.runningCount -= 1;
    this._running[type] -= 1;
}

/*
 * Choose a type from among those waiting to run next.  Return its index.
 * Must select the first eligible index to run types in arrival order.
 * quick guarantees that first type in types is not undefined.
 * Walking types._list directly is no more than 10% faster for of 100,
 * 25% for 500, and is the same speed for short runs.
 */
FairScheduler.prototype.select = function select( types ) {
    // optimize common case of no type being throttled
    var type = types.peek();
    if (!this.isBlocked(type)) return 0;

    var length = types.size();
    if (length > this.maxScanLength) length = this.maxScanLength;
    for (var i=1; i<length; i++) {
        type = types.peekAt(i);
        if (type === undefined) continue;
        if (!this.isBlocked(type)) return i;
    }

    // no runnable type found, pick the first one waiting
    return 0;
}

FairScheduler.prototype.isBlocked = function isBlocked( type ) {
    // optimize common case of no jobs running
    if (!this.runningCount) return false;

    var usingShare = this._running[type] / this.concurrency;
    if (usingShare > this.maxTypeShare) return true;

    var fairShare = this._waiting[type] / this.waitingCount;
    if (usingShare > fairShare) return true;

    return false;
}

// compact the list of running objects
// must be called from outside, not automatically scheduled
// TODO: should also prune the seen types count
FairScheduler.prototype.gc = function gc( ) {
    var _running = this._running;
    var _running2 = {};

    for (var k in _running) {
        if (_running[k] > 0) {
            _running2[k] = _running[k];
        }
    }

    this._running = _running2;
}

// accelerate access to inherited methods
FairScheduler.prototype = FairScheduler.prototype;
