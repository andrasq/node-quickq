/**
 * Copyright (C) 2016-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

;(function(){

'use strict';

var qtimeit = require('qtimeit');
var aflow = require('aflow');
var async = require('async');
var fastq = require('fastq');
var quickq = require('../');

var ncalls = 0, ndone = 0;
function handler(payload, cb) {
    ncalls += 1;
    // async.queue crashes if cb is called directly (max return stack size exceeded)
    // however, direct cb() is 2x faster (and quickq allows it)
    // fastq also crashes but does not print a diagnostic! (does print with node-v6.7.0)
    // wrapping cb with async.ensureAsync() fixes the crash, but is 20% slower

    // fastq runs 50% faster with nextTick than setImmediate, async.queue runs 5% faster
    process.nextTick(cb);
    //setImmediate(cb);
}
function handlerI(payload, cb) {
    ncalls += 1;
    setImmediate(cb);
}
function handlerCb(payload, cb) {
    ncalls += 1;
    cb();
}
function handlerCb10(payload, cb) {
    ncalls += 1;
    if (ncalls % 10 === 0) setImmediate(cb);
    else cb();
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
        var ntasks = 10000;
        var concurrency = 10;

        qtimeit.bench.timeGoal = 1;
        qtimeit.bench.opsPerTest = ntasks;
        qtimeit.bench.visualize = true;
        qtimeit.bench({
            'async.queue': function(done) {
                ncalls = ndone = 0;
                var q = async.queue(handler, concurrency);                // 205k/s
                //var q = async.queue(async.ensureAsync(handlerCb), 10);  // 162k/s
                //var q = async.queue(async.ensureAsync(handler), 10);    // 171-177k/s
                //var q = async.queue(handlerCb10, 10);                   // 221k/s
                q.drain = done;
                for (var i=0; i<ntasks; i++) q.push(0, taskDone);
            },

            // fastq is extremely slow under node-v0.10.42
            fastq: function(done) {
                ncalls = ndone = 0;
                var q = fastq(handler, concurrency);
                q.drain = done;
                for (var i=0; i<ntasks; i++) q.push(0, taskDone);
            },

            // Note: running quickq in combination with fastq will cause quickq
            // throughput to drop 45% on the 5th-6th run, from 5.0m/s to 2.7m/s
            // (ie, from 6x faster to 3x faster than fastq).
            // Quickq by itself or with just async.queue stays fast.
            // Same on Skylake, w/ 10k tasks 5th run drops from 17m/s to 10m/s with setImmediate
            // or 18m/s to 13m/s on 7th run with nextTick (async.queue drops from 860k/s to 740k/s),
            // but happens even standalone from the 10th iteration on; or 6th on concurr 5.
            quickq: function(done) {
                ncalls = ndone = 0;
                var q = quickq(handlerCb, {concurrency: concurrency});
                q.drain = done;
                for (var i=0; i<ntasks; i++) q.push(0, taskDone);
            },

            quickq_scheduled: function(done) {
                ncalls = ndone = 0;
                var q = quickq(handlerI, { concurrency: concurrency, scheduler: 'fair' });
                q.drain = done;
                //for (var i=0; i<ntasks; i++) q.pushType('jobtype', 0, taskDone);
                for (var i=0; i<ntasks; i+=20) {
                    for (var j=0; j<10; j++) q.pushType('jobtype1', 0, taskDone);
                    for (var j=0; j<10; j++) q.pushType('jobtype2', 0, taskDone);
                }
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
