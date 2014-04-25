'use strict';

var url = require('url')
  , fuse = require('fusing')
  , async = require('async')
  , request = require('request')
  , schedule = require('node-schedule');

/**
 * Probe constructor.
 *
 * @constructor
 * @param {Collector} collector instance
 * @api public
 */
function Probe(collector) {
  this.fuse();

  //
  // Name of the probe and the registries the probe should run against.
  //
  this.readable('name', 'ping');
  this.readable('collector', collector);
  this.readable('list', Object.keys(require('../registries')));

  //
  // Ping the mirrors every minute.
  //
  this.readable('spec', {
    minute: new schedule.Range(0, 60, 1)
  });
}

fuse(Probe, require('events').EventEmitter);

/**
 * Ping the endpoint by doing a regular request. Not all registries support ICMP by
 * default. Also these surrogate pings will be more meaningful.
 *
 * @param {Object} endpoint Url parsed registry data
 * @param {Function} next Completion callback
 * @api private
 */
Probe.readable('ping', function ping(endpoint, next) {
  var start = Date.now()
    , timeout = 3E4;

  request({ uri: endpoint.href, timeout: timeout }, function resp(error, response) {
    //
    // If the registry takes longer than the allowed timeout, return 0.
    // Theoretically this lag is impossible, allowing it to be processed correctly.
    //
    if (error && error.code === 'ETIMEDOUT') return next(null, 0);
    if (error || response.statusCode !== 200) return next(new Error('ping failed'));

    next(null, Date.now() - start);
  });
});

/**
 * Ping the endpoint 5 times and get the averaged results from those pings.
 *
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
Probe.readable('execute', function execute(endpoint, done) {
  var probe = this;

  endpoint = [endpoint, endpoint, endpoint, endpoint, endpoint];
  async.map(endpoint, this.ping, function calc(error, result) {
    if (error) return done(error);

    result = probe.collector.calculate(result);
    probe.emit('ping::executed', result);
    done(null, result);
  });
});

/**
 * Calculate the moving average for the provided data with n steps.
 * Defaults to 5 steps.
 *
 * @param {Number} n Amount of steps.
 * @return {Array} Moving average per step.
 * @api private
 */
Probe.transform = function transform(memo, probe, i, stack) {
  var keys = Object.keys(stack)
    , k = i - 5;

  while (++k < i) {
    for (var data in probe.results) {
      memo[data] = memo[data] || probe.results[data] / 5;
      memo[data] += stack[k > 0 ? k : 0].results[data] / 5;
    }
  }

  return memo;
};

/**
 * Return custom content to be displayed as latest measurement.
 *
 * @param {Array} transformed Data transformed with transform
 * @param {Array} plain Orginal data.
 * @returns {Object}
 * @api private
 */
Probe.latest = function latest(transformed, plain) {
  return transformed[transformed.length - 1];
};

/**
 * Group functionality by time, this will group per millisecond or the actual time.
 *
 * @param {Number} time Unix timestamp.
 * @returns {Date}
 * @api public
 */
Probe.group = function group(time) {
  return time;
};

//
// Default stack to map and process results.
//
Probe.map = {};

//
// Export the probe.
//
module.exports = Probe;