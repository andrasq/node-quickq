quickq
======

Fast in-memory work queue.

Quickq is a very fast engine for processing data arriving at arbitrary times, very
low overhead for even small payloads.  Items are appended to the work queue and are
processed in arrival order by one or more concurrent execution threads.

Similar to async.queue but much faster, less flaky, and with a simpler interface.


Overview
--------

        function runner(job, callback) {
            console.log('processing job', job);
            callback();
        }

        var Quickq = require('quickq');
        var q = new Quickq(runner);
        q.push(job, callbackWhenDone);


Api
---

### q = new Quickq( runner [, options] )

- `runner` - the function that will process the job.  Runner takes two arguments,
the job and a callback that must be called when the job is finished.

Options:
- `concurrency` - how many jobs to process concurrently (default 10)

### q.pause( )

Stop processing jobs.  Currently running jobs will finish though.

### q.resume( )

Resume processing jobs.

### q.fflush( cb )

TBD

### q.drain

If set, function to call whenever the work queue empties.

### q.length

The number of jobs in the queue waiting to be processed.

### q.running

The number of jobs currently being processed.


Benchmark
---------

Time to queue and run 1 million no-op tasks:

- async.queue - 5.2 sec
- fastq - 1.42 sec
- quickq - 0.23 sec


Related Work
------------

- [quickq](https://github.com/andrasq/node-quickq) - this package
- [async.queue](https://npmjs.org/package/async) - in-memory work queue
- [fastq](https://npmjs.org/package/fastq) - async.queue clone, but much faster
