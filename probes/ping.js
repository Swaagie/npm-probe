'use strict';

var url = require('url')
  , async = require('async')
  , request = require('request')
  , schedule = require('node-schedule');

//
// Name of the probe.
//
exports.name = 'ping';

//
// Specifications when the probe should be run. Ping will be ran every 3 minutes.
//
exports.spec = {
  minute: new schedule.Range(0, 60, 3)
};

/**
 * Ping the endpoint by doing a regular request. Not all registries support ICMP by
 * default. Also these surrogate pings will be more meaningful.
 *
 * @param {Object} endpoint Url parsed registry data
 * @param {Function} next Completion callback
 * @api private
 */
function ping(endpoint, next) {
  var start = Date.now();

  request(endpoint.href, function request(error, response) {
    if (error || response.statusCode !== 200) return next(new Error('ping failed'));
    next(null, Date.now() - start);
  });
}

/**
 * Ping the endpoint 5 times and get the averaged results from those pings.
 *
 * @param {Collector} collector instance.
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
exports.execute = function execute(collector, endpoint, done) {
  endpoint = [endpoint, endpoint, endpoint, endpoint, endpoint];
  async.map(endpoint, ping, function calc(error, result) {
    if (error) return done(error);
    done(null, exports.calc(result));
  });
};

/**
 * Calculate min, max, avg and stdev from the array of request times.
 *
 * @param {Array} data Request times.
 * @return {Object} Minimum, maximum, average and standard deviation
 * @api public
 */
exports.calc = function calc(data) {
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
};
