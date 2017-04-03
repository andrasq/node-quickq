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
    this.runningCount = 0;      // jobs running
    this.waitingCount = 0;      // jobs waiting to run
    this.typesCount = 0;        // job types seen
    this._waiting = {};         // count of waiting jobs by type
    this._running = {};         // count of running jobs by type
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
        // TODO: maybe skip ahead if next type is the same
        //if (types.peekAt(i+1) === type) { i++; continue }
    }

    // if none were suitable, pick the first one waiting
    return 0;
}

// it is 15% faster to recompute isBlocked state each time
// than to cache it by type.  Simple arithmetic beats hash tables.
FairScheduler.prototype.isBlocked = function isBlocked( type ) {
    // optimize common case of no jobs running
    if (!this.runningCount) return false;

    // block jobs that have reached the max allowed for a single type
    var usingShare = this._running[type] / this.concurrency;
    if (usingShare >= this.maxTypeShare) return true;

    // block jobs that have reached their fair share of those running
    var fairShare = this._waiting[type] / this.waitingCount;
    if (usingShare >= fairShare) return true;

    return false;
}

// compact the list _running and _waiting objects
// must be called from outside, not automatically scheduled
FairScheduler.prototype.gc = function gc( ) {
    this._running = this._omitZeros(this._running);
    this._waiting = this._omitZeros(this._waiting);
}

FairScheduler.prototype._omitZeros = function _omitZeros( obj ) {
    var obj2 = {};
    for (var key in obj) if (obj[key] !== 0) obj2[key] = obj[key];
    return obj2;
}

// accelerate access to inherited methods
FairScheduler.prototype = FairScheduler.prototype;
