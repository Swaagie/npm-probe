'use strict';

var fs = require('fs')
  , path = require('path')
  , fuse = require('fusing')
  , async = require('async')
  , schedule = require('node-schedule')
  , debug = require('debug')('npm-probe');

//
// Base path for all default probes.
//
var base = path.join(__dirname, 'probes');

/**
 * Collector instance, can be provided with following options.
 *  - probes {Array}: probes to use
 *  - cache {Object}: cache instance on which set(key, value, ttl) can be called
 *
 * @constructor
 * @param {Object} options
 * @api public
 */
function Collector(options) {
  this.fuse();

  //
  // Probes will be stored in probe list. Cache is not required, but if available
  // all data will be stored v
  //
  this.writable('probes', []);
  this.readable('options', options || {});
  this.readable('cache', this.options.cache || null);
  this.readable('registries', require('./registries'));

  this.initialize();
}

//
// Add EventEmitter capacities.
//
fuse(Collector, require('events').EventEmitter);

/**
 * Register a probe to be used against the known registries.
 *
 * @param {Object} probe Valid probe object having name, spec and execute as keys.
 * @return {Array} List of probes that can be added to the stack.
 * @api public
 */
Collector.readable('use', function use(probe) {
  var collector = this;

  //
  // Any provided probe should have a valid name, specification and function to
  // execute. Simply ignore probes which are invalid.
  //
  if (!probe.name || !probe.spec || 'function' !== typeof probe.execute) return;

  return Object.keys(this.registries).map(function map(endpoint) {
    debug('[npm-probe] added probe %s for registry: %s', probe.name, endpoint);
    collector.emit('probe::scheduled', probe.name, Date.now());

    return schedule.scheduleJob(probe.name, probe.spec, function execute() {
      probe.execute(
        collector,
        collector.registries[endpoint],
        collector.expose(probe, endpoint)
      );
    });
  });
});

/**
 * Emit `ran` events per registered probe, provide proper name and data.
 *
 * @param {Object} probe details of probe to be executed
 * @param {Object} endpoint name of the endpoint, e.g. nodejitsu
 * @return {Function} callback to be called
 * @api private
 */
Collector.readable('expose', function expose(probe, registry) {
  var start = Date.now()
    , collector = this;

  debug('[npm-probe] provide callback for probe: %s at %s', probe.name, start);
  return function ran(error, data) {
    var end = Date.now();

    if (error) {
      debug('[npm-probe] emit `error` for probe: %s/%s at %s', registry, probe.name, end);
      return collector.emit('probe::error', error);
    }

    data = {
      name: probe.name,
      registry: registry,
      results: data,
      start: start,
      end: end,
      duration: end - start
    };

    collector.emit('probe::ran', null, data);
    collector.emit('probe::ran::' + probe.name, null, data);
    debug('[npm-probe] emit `ran` for probe: %s at %s', probe.name, end);

    //
    // Optionally cache the results in provided cache layer.
    //
    if (!collector.cache || 'function' !== typeof collector.cache.set) return;
    collector.cache.set(collector.key(data), data.results, function done() {
      debug('[npm-probe] data cached in key: %s', collector.key(data));
    });
  };
});

/**
 * Extract the cache key name from the data, based on combination of
 * the following data: `data.registry / data.name / data.start`.
 *
 * @param {Object} data
 * @return {String} key name based on data
 * @api public
 */
Collector.readable('key', function key(data) {
  return [
    data.registry,
    data.name,
    data.start
  ].join('/');
});

/**
 * Initialize our probes and push them on the probe stack.
 *
 * @api public
 */
Collector.readable('initialize', function initialize() {
  debug('[npm-probe] initializing with %s probes', this.options.probes.length);
  this.probes = this.probes.concat(this.options.probes.map(this.use.bind(this)));
});

//
// Expose set of default probes by filename.
//
Collector.probes = fs.readdirSync(__dirname + '/probes').reduce(function reduce(memo, file) {
  if (path.extname(file) !== '.js') return;

  memo[path.basename(file, '.js')] = require(path.join(base, file));
  return memo;
}, {});

//
// Export the Collector.
//
module.exports = Collector;