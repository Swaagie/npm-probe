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
 *
 * @constructor
 * @param {Object} options
 * @api public
 */
function Collector(options) {
  this.fuse();

  //
  // Probes will be stored in probe list.
  //
  this.writable('probes', []);
  this.readable('options', options || {});
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
    collector.emit('scheduled', probe.name, Date.now());

    endpoint = collector.registries[endpoint];
    return schedule.scheduleJob(probe.name, probe.spec, function execute() {
      probe.execute(collector, endpoint, collector.expose(probe, endpoint));
    });
  });
});

/**
 * Emit `ran` events per registered probe, provide proper name and data.
 *
 * @param {Object} probe details of probe to be executed
 * @param {Object} endpoint url parsed endpoint
 * @return {Function} callback to be called
 * @api private
 */
Collector.readable('expose', function expose(probe, endpoint) {
  var start = Date.now()
    , collector = this;

  debug('[npm-probe] provide callback for probe: %s at %s', probe.name, start);
  return function ran(error, data) {
    var end = Date.now();

    if (error) {
      debug('[npm-probe] emit `error` for probe: %s at %s', probe.name, end);
      return collector.emit('ran', error);
    }

    data = {
      name: probe.name,
      registry: endpoint.host,
      data: data,
      start: start,
      end: end,
      duration: end - start
    };

    collector.emit('ran', null, data);
    collector.emit('ran::' + probe.name, null, data);
    debug('[npm-probe] emit `ran` for probe: %s at %s', probe.name, end);
  };
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