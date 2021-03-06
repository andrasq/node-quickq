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
    // TODO: not clear whether should support "0" to stop queue (ie block all types)
    if (this.maxTypeCap <= 0 || typeRunning >= this.maxTypeCap) return true;

    // block jobs that have reached their type-specific cap
    // Note that if a type-specific cap is not positive (<= 0) it will block that type.
    if (this.typeCaps[type] > -Infinity) {
        if (this.typeCaps[type] <= 0 || typeRunning >= this.typeCaps[type]) return true;
    }

    return false;
}
