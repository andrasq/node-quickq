quickq
======

Fast in-memory work queue.

Quickq is a very fast engine for processing data arriving at arbitrary times, very
low overhead for even small payloads.  Items are appended to the work queue and are
processed in arrival order by one or more concurrent execution threads.

Similar to async.queue but much faster, less flaky, and with a simpler interface.


Overview
--------

    var quickq = require('quickq');
    var queue = quickq(jobRunner);

    function jobRunner(job, cb) {
        console.log('processing job', job);
        cb(null, 1234);
    }

    var job = 'job1-data';
    queue.push(job, function(err, ret) {
        console.log('job done, got', ret);
    })

    // =>
    //   processing job job1-data
    //   job done, got 1234


Api
---

### q = new Quickq( runner [, options] )

- `runner` - the function that will process the job.  Runner takes two arguments,
the job and a callback that must be called when the job is finished.

Options:
- `concurrency` - how many jobs to process concurrently (default 10)

### q.push( payload [, callback(err, ret)] )

Append a job (data to be processed) to the work queue.  If a callback is specified,
it will be called after the job finishes.

### q.unshift( payload [, callback(err, ret)] )

Prepend a job to the work queue.  This job is placed at the head of the queue, it
will be the next one to be processed.

### 

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

Time to enqueue and run 1 million no-op tasks, timed with Date.now():

    async.queue - 5.2 sec
    fastq - 1.42 sec
    quickq - 0.23 sec

Time create queue then enqueue and run 100k no-op tasks, timed with qtimeit:

    node=6.2.2 arch=ia32 mhz=3500 cpu="AMD Phenom(tm) II X4 B55 Processor" up_threshold=11
    async.queue  219,734 ops/sec (1 runs of 4 in 1.820 over 10.234s, +/- 0%) 1000
    fastq  782,554 ops/sec (3 runs of 4 in 1.533 over 4.506s, +/- 0%) 3561
    quickq  4,721,075 ops/sec (10 runs of 4 in 0.847 over 2.636s, +/- 0%) 21485


Related Work
------------

- [quickq](https://github.com/andrasq/node-quickq) - this package
- [async.queue](https://npmjs.org/package/async) - in-memory work queue
- [fastq](https://npmjs.org/package/fastq) - async.queue clone, but much faster


Todo
----

- needs unit tests
