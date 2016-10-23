/**
 * durable store to record jobs jobs not yet completed.
 * The store is implemented as an appended-to journal.
 * The journal is automatically truncated when all jobs finish.
 *
 * 2016-10-22 - AR.
 */

'use strict';

module.exports = Journal;

/**
durable store:
"coat check" model: exchange job for an id.  Can retrieve job by id until deleted.
The durable store will persist the payload between restarts.

- insert, get-next-id, lookup, remove, reload

**/

var fs = require('fs');
var mongoid = require('mongoid-js');
var aflow = require('aflow');


function Journal( opts ) {
    if (!queue || !opts || !opts.journal) throw new Error("queue and options.journal required");

    // TODO: inject store
    this.store = new DurableFile(opts.journal);
    this.length = 0;
    this.ids = new Array();
    this.jobMap = {};
    this.fd = null;
    this._dirty = false;        // Journal contains changes not yet written to journal
}

Journal.prototype.insert = function insert( job, cb ) {
    var id = mongoid();
    this.ids.push(id);
    this.map[id] = job;
    this.length += 1;
    this._dirty = true;
    var self = this;
    this.store.insert(id, id + ' ' + JSON.stringify(job), function(err) {
        self._dirty = false;
        maybeCallback(err, id, cb);
    })
    return id;
}

Journal.prototype.getId = function getId( ) {
    return this.ids.shift();
}

Journal.prototype.lookup = function lookup( id ) {
    return this.jobMap[id];
}

Journal.prototype.remove = function remove( id, cb ) {
    if (this.jobMap[id] !== undefined) {
        this.jobMap[id] = undefined;
        this.length -= 1;
        this._dirty = true;
    }
    // inserting an empty id means deletion
    var self = this;
    function onRemove(err) {
        self._dirty = false;
        if (err) maybeCallback(err, null, cb);
        if (!self.length) {
// TODO: truncate not too often, eg only every 10 sec
// TODO: every so often copy over the jobMap to purge the old deleted keys
            self.store.clear(function(err) {
                self.jobMap = {};
                self.ids = new Array();
                maybeCallback(err, null, cb);
            })
        }
    }
    if (this.store.remove) this.store.remove(id, onRemove);
    else this.store.insert(id, id, onRemove);
}

Journal.prototype.reload = function reload( cb ) {
    var self = this;
    var lines = null;
    var ids = new Array(), doneIds = {}, jobs = {};
    var i, id, job;
    var lineCount = 0;

    aflow.repeatUntil(
        function(done) {
            self.store.load(function(err, lines) {
                if (err || !lines.length) return done(err, 'done');

                for (i=0; i<lines.length; i++) {
                    if (lines[i] === "") continue;
                    if (lines[i].length <= 24) {
                        doneIds[lines[i]] = true;
                    }
                    else {
                        id = lines[i].slice(0, 24);
                        job = json_decode(lines[i].slice(24));
// TODO: time whether a struct is faster than slicing the line
                        if (job instanceof Error) return cb(new Error("invalid json in job " + id + " on line " + (lineCount + i + 1)));
                        ids.push(id);
                        jobs[id] = job;
                    }
                }
                lineCount += lines.length;
                done();
            })
        },
        function (err) {
            for (i=0; i<ids.length; i++) {
                if (!doneIds[ids[i]]) {
                    self.ids.push(ids[i]);
                    self.jobMap[ids[i]] = jobs[ids[i]];
                }
            }
            cb(err);
        }
    )
}

function maybeCallback( err, ret, cb ) {
    if (cb) return cb(err, ret);
    else if (err) throw err;
    else return ret;
}

function json_decode( str ) {
    try { return JSON.parse(str) }
    catch (err) { return err }
}

// accelerate access
Journal.prototype = Journal.prototype;


/**
 * Durable backing store api:
 *   insert() - store an item string into the store.  Deletion is done by storing a new empty item.
 *     Ids are unique but may repeat, and are passed to allow the store to optimize usage.
 *     Only the most recently stored value of any given id is valid.  Inserting just the id string means deleted.
 *   remove() - remove an item by id.  This method is optional, if missing then items are overwritten.
 *   load() - return batches of items from the store in insertion order.  Call repeatedly until returns empty array.
 *     It is ok if older values of an id are returned as long as the most recent is returned last.
 *   clear() - remove all items from the store
 * Note that this api requires the caller to disambiguate duplicate ids on load(),
 * ie the stored values must embed the id.
 */
function DurableFile( filename ) {
    this.filename = filename;
    this.fd = fs.createWriteStream(filename, { flags: 'a', highWaterMark: 204800 });
}
DurableFile.prototype.insert = function insert( id, data, cb ) {
    this.fd.write(data + '\n', function(err) {
// TODO: time whether faster to writeSync
        cb(err);
    })
}
DurableFile.prototype.load = function load( cb ) {
    return fs.readFile(this.filename, function(err, contents) {
        if (err) return cb(err);
        cb(null, contents.toString().trim().split('\n'));
    })
}
DurableFile.prototype.clear = function truncate( cb ) {
    // truncateSync to prevent a concurrent append
    try {
        // note that truncate frees disk blocks, and can be slow for huge files
        fs.truncateSync(this.filename);
        this.fd = fs.createWriteStream(filename, { flags: 'a', highWaterMark: 204800 });
        cb();
    } catch (err) {
        cb(err);
    }
}
DurableFile.prototype = DurableFile.prototype;
