/*
 * 2016-08-26 - AR.
 */

'use strict';

var quickq = require('./');

module.exports = {
    'should parse package.json': function(t) {
        require("./package.json");
        t.done();
    },

    beforeEach: function(done) {
        var jobs = [];
        this.jobs = jobs;
        this.handler = function(job, cb){ jobs.push(job); setTimeout(cb, job) };
        this.q = quickq(this.handler, 2);
        done();
    },

    'constructor': {
        'should create distinct objects': function(t) {
            t.notEqual(quickq(this.handler), quickq(this.handler));
            t.notEqual(quickq(this.handler), new quickq(this.handler));
            t.done();
        },

        'should require handler function': function(t) {
            t.throws(function(){ quickq() });
            t.done();
        },

        'should default concurrency': function(t) {
            var q = quickq(this.handler);
            t.equal(q.concurrency, 10);
            t.done();
        },

        'should accept numeric concurrency': function(t) {
            t.equal(quickq(this.handler, 5).concurrency, 5);
            t.equal(quickq(this.handler, '6').concurrency, 6);
            t.done();
        },

        'should accept concurrency option': function(t) {
            var q = quickq(this.handler, {concurrency: 3});
            t.equal(q.concurrency, 3);
            t.done();
        },
    },

    'enqueue': {
        'push should enqueue job': function(t) {
            this.q.push(1);
            t.equal(this.q.length, 1);
            t.done();
        },

        'unshift should enqueue job': function(t) {
            this.q.unshift(1);
            t.equal(this.q.length, 1);
            this.q.unshift(2);
            this.q.unshift(3);
            t.equal(this.q.length, 3);
            t.done();
        },

        'push should enqueue array of jobs': function(t) {
            this.q.push(1);
            t.equal(this.q.length, 1);
            this.q.push(2);
            this.q.push(3);
            t.equal(this.q.length, 3);
            t.done();
        },
    },

    'running': {
        'pause should stop job running': function(t) {
            this.q.pause();
            this.q.push(1);
            var self = this;
            setTimeout(function(){
                t.equal(self.q.length, 1);
                t.equal(self.jobs[0], undefined);
                t.done();
            }, 5);
        },

        'resume should resume job running': function(t) {
            this.q.concurrency = 0;
            this.q.pause();
            this.q.push(1);
            this.q.resume();
            var self = this;
            setTimeout(function(){
                t.equal(self.q.length, 0);
                t.equal(self.jobs[0], 1);
                t.done();
            }, 5);
        },

        'should run many jobs not exceeding concurrency': function(t) {
            var maxRunning = 0;
            var q = quickq(function(job, cb){
                if (q.running > maxRunning) maxRunning = q.running;
                setTimeout(cb, 1);
            }, 4);
            var data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            for (var i=0; i<data.length; i++) q.push(data[i]);
            setTimeout(function(){
                t.equal(maxRunning, 4);
                t.done();
            }, 5);
        },

        'should decrease runners to match concurrency': function(t) {
            var runners = [];
            var q = quickq(function(job, cb) {
                runners.push(q.runners);
                if (runners.length == 5) q.concurrency = 2;
                cb();
            }, 4);
            var data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            for (var i=0; i<data.length; i++) q.push(data[i]);
            q.drain = function() {
                t.deepEqual(runners.slice(5), [2, 2, 2, 2, 2]);
                t.done();
            }
        },

        'should notify on drain': function(t) {
            t.expect(1);
            this.q.push(1);
            var self = this;
            this.q.drain = function() {
                t.ok(1);
                t.done();
            }
        },

        'should notify on fflush': function(t) {
            this.q.push(1);
            var ndone = 0;
            this.q.fflush();
            this.q.fflush(function() { if (++ndone == 2) t.done(); });
            this.q.fflush(function() { if (++ndone == 2) t.done(); });
        },

        'should return exceptions from inside handler': function(t) {
            var q = quickq(function(job, cb) {
                throw new Error("die");
            }, 1);
            var self = this;
            q.push(1, function(err, ret) {
                t.ok(err);
                t.equal(err.message, "die");
                t.done();
            });
            q.push(2);
            setTimeout(function(){}, 5);
        },
    },

    'speed': {
        'should run 100k tasks': function(t) {
            var q = quickq(function(job, cb) { cb() });
            var ndone = 0;
            function whenDone() { ndone += 1 }
            for (var i=0; i<100000; i++) q.push(i, whenDone);
            q.fflush(function() {
                t.equal(ndone, 100000);
                t.done();
            });
        },
    },
}
