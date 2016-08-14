quickq
======

Fast in-memory work queue.

Quickq is a very fast engine for processing data arriving at arbitrary times, very
low overhead for even small payloads.  Items are appended to the work queue and are
processed in arrival order by one or more concurrent execution threads.

Similar to async.queue but much faster, less flaky, and with a simpler interface.


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
