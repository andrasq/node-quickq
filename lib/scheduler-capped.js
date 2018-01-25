/**
 * capped job scheduler
 *
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

module.exports = CappedScheduler;


var util = require('util');
var FairScheduler = require('./scheduler-fair');

function CappedScheduler( options ) {
    this.maxTypeCap = Infinity;
    this.typeCaps = {};

    FairScheduler.call(this, options);

    this.configure(options);
}
util.inherits(CappedScheduler, FairScheduler);

CappedScheduler.prototype.configure = function configure( options ) {
    FairScheduler.prototype.configure.call(this, options);

    options = options || {};
    if (typeof options.maxTypeCap === 'number') this.maxTypeCap = options.maxTypeCap;
    if (options.typeCaps !== undefined) {
        // merge in per-type caps to be able to pick-and-choose types to cap
        if (!options.typeCaps) this.typeCaps = {};
        for (var k in options.typeCaps) this.typeCaps[k] = options.typeCaps[k];
    }

    return this;
}

CappedScheduler.prototype.isBlocked = function isBlocked( type ) {
    // block jobs that have reached the max allowed % for a single type
    var typeRunning = this._running[type];
    var usingShare = typeRunning / this.concurrency;
    if (usingShare >= this.maxTypeShare) return true;

    // block jobs that have reached the global cap
    // TODO: not clear whether should support "0" to stop queue
    if (!this.maxTypeCap || typeRunning >= this.maxTypeCap) return true;

    // block jobs that have reached their type-specific cap
    // note that if a type is not yet running a cap of 0 will not block
    // if typeRunning is undefined (undefined is not greater than number)
    // TODO: not clear whether should support "0" to block a specific type
    if (this.typeCaps[type] >= 0) {
        if (!this.typeCaps[type] || typeRunning >= this.typeCaps[type]) return true;
    }

    return false;
}
