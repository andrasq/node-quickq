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


Benchmark
---------

Time to enqueue and run 1 million no-op tasks, timed with Date.now():

    async.queue - 5.2 sec
    fastq - 1.42 sec
    quickq - 0.16 sec

Time create queue then enqueue and run 100k no-op tasks, timed with qtimeit:
(async-2.0.1, fastq-1.4.1, quickq-0.7.0)

    node=6.2.2 arch=ia32 mhz=3500 cpu="AMD Phenom(tm) II X4 B55 Processor" up_threshold=11
    name  speed  (stats)  rate
    async.queue  211,185 ops/sec (1 runs of 4 in 1.894 over 10.682s, +/- 0%) 1000
    fastq  804,067 ops/sec (3 runs of 4 in 1.492 over 4.616s, +/- 0%) 3807
    quickq  6,804,653 ops/sec (5 runs of 20 in 1.470 over 2.653s, +/- 0%) 32221


Api
---

### q = quickq( runner [, options] )

Job queue factory, same as `q = new quickq()`.  If options is a number, it will be
used as the concurrency.

- `runner` - the function that will process the job.  Runner takes two arguments,
the job and a callback that must be called when the job is finished.

Options:
- `concurrency` - how many jobs to process concurrently (default 10)

### q.push( payload [, callback(err, ret)] )

Append a job (data to be processed) to the work queue.  If a callback is specified,
it will be called when the job finishes.

### q.unshift( payload [, callback(err, ret)] )

Prepend a job to the work queue.  The job is placed at the head of the queue, it
will be the next one to be processed.

### q.pause( )

Stop processing jobs by setting concurrency to -1.  Currently running jobs will
still finish though.

### q.resume( )

Resume processing jobs by restoring the last positive concurrency used.  If
concurrency was never positive, sets concurrency to 10.

### q.fflush( cb )

TBD

### q.drain

If set, function to call whenever the work queue empties.

### q.length

The number of jobs in the queue that have not finished yet, ie jobs waiting to run
or running.

### q.running

The number of jobs currently being processed.


Related Work
------------

- [quickq](https://github.com/andrasq/node-quickq) - this package
- [async.queue](https://npmjs.org/package/async) - in-memory work queue
- [fastq](https://npmjs.org/package/fastq) - async.queue clone, but much faster


Todo
----

- figure out how to wrap in closure for browsers and still maintain 100% coverage
- accept concurrency to resume()
- change _scheduleJob to take as input the first job to run, deprecate getLength() use just isEmpty()

