/**
 * Copyright (C) 2016 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

;(function(){

'use strict';

var qtimeit = require('qtimeit');
var aflow = require('aflow');
var async = require('async');
var fastq = require('fastq');
var quickq = require('./');

var ncalls = 0, ndone = 0;
function handler(payload, cb) {
    ncalls += 1;
    // async.queue crashes if cb is called directly (max return stack size exceeded)
    // however, direct cb() is 2x faster (and quickq allows it)
    // fastq also crashes but does not print a diagnostic!
    process.nextTick(cb);
}
function handlerCb(payload, cb) {
    ncalls += 1;
    cb();
}
function taskDone() {
    ndone += 1;
}


var iteration = 5;
aflow.repeatWhile(
    function() {
        return iteration-- > 0;
    },
    function(cb) {
        var ntasks = 100000;
        var q1 = async.queue(handler, 10);
        var q2 = fastq(handler, 10);
        var q3 = quickq(handlerCb, {concurrency: 10});
        qtimeit.bench.timeGoal = 2;
        qtimeit.bench.opsPerTest = ntasks;
        qtimeit.bench({
            'async.queue': function(done) {
                ncalls = ndone = 0;
                var q = async.queue(handler, 10);
                q.drain = done;
                for (var i=0; i<ntasks; i++) q.push(0, taskDone);
            },
            fastq: function(done) {
                ncalls = ndone = 0;
                var q = fastq(handler, 10);
                q.drain = done;
                for (var i=0; i<ntasks; i++) q.push(0, taskDone);
            },
            // Note: running quickq in combination with fastq will cause quickq
            // throughput to drop 45% on the 5th-6th run, from 5.0m/s to 2.7m/s
            // (ie, from 6x faster to 3x faster than fastq).
            // Quickq by itself or with just async.queue stays fast.
            quickq: function(done) {
                ncalls = ndone = 0;
                var q = quickq(handlerCb, {concurrency: 10});
                q.drain = done;
                for (var i=0; i<ntasks; i++) q.push(0, taskDone);
            },
        },
        function(err){
            console.log("--");
            cb();
        });
    },
    function(err) {
        // console.log("Done.");
    }
);

// 1m times measured with process.hrtime()
if (0) {
    //q = async.queue(handler, 10);
    //q = fastq(handler, 10);
    var q = new quickq(handlerCb, {concurrency: 10});

    var t1 = qtimeit.fptime();
    for (var i=0; i<1000000; i++) q.push(0, taskDone);
    q.drain = function onDrain( ) {
        var t2 = qtimeit.fptime();
        console.log("AR: %d/%d tasks done in %d ms", ndone, ncalls, t2 - t1);
    }
}

})();
