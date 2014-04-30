'use strict';

var url = require('url')
  , async = require('async')
  , request = require('request')
  , schedule = require('node-schedule')
  , Probe = require('./probe')('ping', { minute: new schedule.Range(0, 60, 1) });

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
    , timeout = endpoint.timeout || 3E4;

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
 * @param {Object} endpoint URL parsed endpoint.
 * @param {Function} done Completion callback.
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
 * @param {Object} memo Data.
 * @param {Object} probe Measurements of single probe.
 * @param {Number} i Current iteration.
 * @param {Array} stack Complete serie of measurements.
 * @return {object} memo with moving average calculations.
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
 * @returns {Mixed}
 * @api private
 */
Probe.latest = function latest(transformed, plain) {
  var last = transformed[transformed.length - 1]
    , cur = plain[plain.length - 1];

  //
  // Lag of zero indicates down status.
  //
  if (last.values.mean === 0) return 'down';

  //
  // If the current measurement was slower than 2 times the moving average
  // standard deviation report it as slow.
  //
  if (cur.results.mean - (2 * last.values.stdev) > last.values.mean) return 'slow';

  //
  // Return last value normally.
  //
  return last.values.mean;
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