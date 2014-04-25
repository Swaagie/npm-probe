'use strict';

var fs = require('fs')
  , url = require('url')
  , path = require('path')
  , fuse = require('fusing')
  , async = require('async')
  , request = require('request')
  , schedule = require('node-schedule')
  , debug = require('debug')('npm-probe');

//
// Base path for all default probes.
//
var base = path.join(__dirname, 'probes')
  , registries = require('./registries');

/**
 * Collector instance, can be provided with following options.
 *  - probes {Array}: probes to use
 *  - cache {Object}: cache instance on which set(key, value, ttl) can be called
 *  - silent {Boolean}: if true do not aquire data
 *
 * @constructor
 * @param {Object} options
 * @api public
 */
function Collector(options) {
  this.fuse();

  //
  // Probes will be stored in probe list. Cache is not required, but if available
  // all data will be stored against the provided cache layer.
  //
  this.writable('feed');
  this.writable('probes', []);
  this.readable('options', options || {});
  this.readable('cache', this.options.cache || null);

  //
  // Add optional error event listener provided via options.
  //
  if (this.options.error) this.on('error', this.options.error);
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
 * @returns {Array} List of probes that can be added to the stack.
 * @api public
 */
Collector.readable('use', function use(Probe) {
  var collector = this
    , probe;

  //
  // Any provided probe should have a valid name, specification and function to
  // execute. Simply ignore probes which are invalid.
  //
  probe = new Probe(collector);
  if (!probe.name || !probe.spec || 'function' !== typeof probe.execute) return;

  return probe.list.map(function map(endpoint) {
    debug('[npm-probe] added probe %s for registry: %s', probe.name, endpoint);
    collector.emit('probe::scheduled', probe.name, Date.now());

    return schedule.scheduleJob(probe.name, probe.spec, function execute() {
      probe.execute(registries[endpoint], collector.expose(probe, endpoint));
    });
  });
});

/**
 * Emit `ran` events per registered probe, provide proper name and data.
 *
 * @param {Object} probe details of probe to be executed
 * @param {Object} endpoint name of the endpoint, e.g. nodejitsu
 * @returns {Function} callback to be called
 * @api private
 */
Collector.readable('expose', function expose(probe, registry) {
  var start = Date.now()
    , collector = this;

  debug('[npm-probe] provide callback for probe: %s at %s', probe.name, start);
  return function ran(error, data) {
    var end = Date.now()
      , clone;

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

    //
    // Clone before emitting, so external listeners cannot polute data storage.
    //
    clone = JSON.parse(JSON.stringify(data));
    collector.emit('probe::ran', null, clone);
    collector.emit('probe::ran::' + probe.name, null, clone);
    debug('[npm-probe] emit `ran` for probe: %s at %s', probe.name, end);

    //
    // Optionally cache the results in provided cache layer.
    //
    if (!collector.cache || 'function' !== typeof collector.cache.set) return;
    collector.cache.set(collector.key(data), data, function done() {
      debug('[npm-probe] data cached in key: %s', collector.key(data));
    });
  };
});

/**
 * Extract the cache key name from the data, based on combination of
 * the following data: `data.registry / data.name / data.start`.
 *
 * @param {Object} data
 * @returns {String} key name based on data
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
 * Initialize our probes and push them on the probe stack. Also start the feed
 * updater. Note: the methodology opts for snapshots versus continuous monitoring.
 * Not all changes are required for getting the status at a given point in time.
 *
 * @api public
 */
Collector.readable('initialize', function initialize() {
  var feed = url.format(this.changes)
    , probes = this.options.probes
    , collector = this;

  //
  // Update the cached data every 3 minutes.
  //
  (function updater(init) {
    debug('[npm-probe] updating the feed cache');

    request(feed, function done(error, response, body) {
      if (error || response.statusCode !== 200) {
        return collector.emit('error', new Error('[npm-probe] failed to updated feed'));
      }

      try {
        collector.feed = JSON.parse(body).results;
        debug('[npm-probe] succesfully updated the feed cache');
      } catch(e) { collector.emit('error', e); }

      //
      // Add the probes only on the first run after a succeful cache feed.
      //
      if (init) {
        debug('[npm-probe] initializing with %s probes', probes.length);
        Array.prototype.push.apply(collector.probes, probes.map(function map(probe) {
          return collector.use(probe);
        }));
      }

      setTimeout(updater, 18E4);
    });
  })(process.env.PROBE !== 'silent' && !this.options.silent);
});

/**
 * Calculate min, max, avg and stdev from the array of request times.
 *
 * @param {Array} data Request times.
 * @returns {Object} Minimum, maximum, average and standard deviation
 * @api public
 */
Collector.readable('calculate', function calculate(data) {
  var mean = data.reduce(function sum(a, b) {
    return a + b;
  }, 0) / data.length;

  return {
    mean: mean,
    minimum: Math.min.apply(null, data),
    maximum: Math.max.apply(null, data),
    stdev: Math.sqrt(data.reduce(function deviation(dev, current) {
      return dev + Math.pow(current - mean, 2);
    }, 0) / (data.length - 1))
  };
});

/**
 * Group by categorize per day, day equals the day number of the year.
 *
 * @param {Function} interval Return time interval based on probe start.
 * @param {Function} categorize Determine category by mapReduce.
 * @param {Mixed} base Result stack data layout.
 * @returns {Function} Runs the actual grouping.
 * @api public
 */
Collector.readable('group', function group(interval, categorize, base) {
  var collector = this;

  return function execute(data) {
    var result = data.reduce(function reduce(memo, probe, i) {
      var t = interval(probe.start);

      memo[t] = memo[t] || collector.clone(base);
      memo[t] = categorize(memo[t], probe, i, data);
      return memo;
    }, {});

    //
    // Return a flat array with results per interval transformed with categorize.
    //
    return Object.keys(result).reduce(function maptoarray(stack, t) {
      var items = Array.isArray(result[t])
        ? result[t].map(function map(item) { return { t: t, values: item}; })
        : [{ t: t, values: result[t] }];

      Array.prototype.push.apply(stack, items);
      return stack;
    }, []);
  };
});

/**
 * Helper function to call the correct data function.
 *
 * @param {String} method
 * @param {String} type Name of data type.
 * @param {Mixed} arguments multiple additional arguments
 * @returns {Mixed} results of data method.
 * @api public
 */
Collector.readable('run', function run(method, type) {
  type = Collector.probes[type];

  switch (method) {
    case 'transform':
      method = this.group(type.group, type.transform, type.map);
    break;

    case 'latest':
      method = type.latest;
    break;
  }

  return method.apply(this, Array.prototype.slice.call(arguments, 2));
});

/**
 * Basic cloning functionality to prevent mixing of results.
 *
 * @param {Mixed} input Object to clone.
 * @returns {Mixed} cloned input
 * @api public
 */
Collector.readable('clone', function clone(input) {
  return JSON.parse(JSON.stringify(input));
});

//
// CouchDB to query for the changes feed.
//
Collector.readable('changes', {
  protocol: 'https:',
  slashes: true,
  host: 'skimdb.npmjs.com',
  hostname: 'skimdb.npmjs.com',
  search: '?descending=true&limit=25&include_docs=true',
  query: 'descending=true&limit=25&include_docs=true',
  pathname: '/registry/_changes',
  path: '/registry/_changes?descending=true&limit=25&include_docs=true'
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