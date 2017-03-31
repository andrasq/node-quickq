'use strict';

module.exports = FairScheduler;

function FairScheduler( ) {
    this.running = {};
    // ... TBD
}

// Job of type started, track jobs.
FairScheduler.prototype.start = function start( type ) {
    if (this.running[type]) this.running[type] += 1;
    else this.running[type] = 1;
}

// Job of type finished, track jobs.
FairScheduler.prototype.done = function done( type ) {
    if (this.running[type] > 1) this.running[type] -= 1;
    else delete this.running[type];
}

// Choose a type from among the types to run next.  Return its index.
FairScheduler.prototype.select = function select( types ) {
    // FIXME: first job is a placeholder
    return 0;
}


// accelerate access to inherited methods
FairScheduler.prototype = FairScheduler.prototype;
