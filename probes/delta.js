'use strict';

var url = require('url')
  , async = require('async')
  , request = require('request')
  , schedule = require('node-schedule');

//
// Name of the probe.
//
exports.name = 'delta';

//
// Delta on latest 25 feeds will be ran every 10 minutes.
//
exports.spec = {
  minute: new schedule.Range(0, 60, 10)
};

//
// List of registries the probe should be run against.
//
exports.list = Object.keys(require('../registries'));

//
// Set of functions to check the equality of a and b for set of keys.
//
exports.equal = {
  'name': function name(a, b) {
    return a && b && a === b;
  },

  'time': function time(a, b) {
    if (!a || !b) return false;
    var mod = a.modified === b.modified;

    a = Array.isArray(a) ? a : Object.keys(a);
    b = Array.isArray(a) ? a : Object.keys(a);

    return mod && a.length === b.length && a.reduce(function has(memo, item) {
      return memo && ~b.indexOf(item);
    }, true);
  },

  //
  // Unpublished modules will have no versions, modified time should be equal.
  // In addition, modules will be checked for the presence of `time.unpublished`.
  //
  'versions': function versions(a, b) {
    if (!a || !b) return false;

    a = Array.isArray(a) ? a : Object.keys(a);
    b = Array.isArray(a) ? a : Object.keys(a);

    return a.length === b.length && a.reduce(function has(memo, item) {
      return memo && ~b.indexOf(item);
    }, true);
  },

  //
  // Unpublished modules will have no distributions, modified time should be equal.
  //
  'dist-tags': function latest(a, b) {
    return a && b && a.latest === b.latest;
  }
};

/**
 * Combine the results to a meaningful object.
 *
 * @param {Boolean} equal Calculate difference from perspective of equality.
 * @param {Object} origin Module document from original feed.
 * @param {Object} variation Module document from target registry.
 * @return {Object} Module name and its absolute lag in msec
 * @api private
 */
exports.lag = function lag(equal, origin, variation) {
  var mirror = 0
    , main = 0;

  //
  // If the document for the target npm mirror is missing, registry has lag equal
  // to module creation. Otherwise calculate the difference between modified.
  //
  if (!equal) {
    if (origin && variation) {
      main = (new Date(origin.time.modified)).getTime();
      mirror = (new Date(variation.time.modified)).getTime();
    }

    if (!variation) {
      main = (new Date(origin.time.created)).getTime();
      mirror = Date.now();
    }
  }

  //
  // Return absolute lag in msec.
  //
  return {
    module: origin.name,
    lag: Math.abs(mirror - main)
  };
};

/**
 * Get the difference between both objects for listed `exports.equal` functions.
 * If the variation is missing or null then return immediatly.
 *
 * @param {Object} origin Module document from original feed.
 * @param {Object} variation Module document from target registry.
 * @api private
 */
exports.diff = function diff(origin, variation) {
  var keys = [];

  try {
    if (!variation) throw new Error('No variation doc found');
    variation = JSON.parse(variation);
  } catch (e) {
    return exports.lag(false, origin);
  }

  for (var check in exports.equal) {
    if (!exports.equal[check](origin[check], variation[check])) keys.push(check);
  }

  return exports.lag(!keys.length, origin, variation);
};

/**
 * Check for error responses in the body. This is required since not all 404's or
 * errors can be blindly treated as a missing document.
 *
 * @param {String} body Content to be checked.
 * @return {Boolean} body has error
 */
exports.error = function(body) {
  return ~body.indexOf('"error":"not_found"')
      || ~body.indexOf('"error":"illegal_database_name"');
};

/**
 * Check the last changes feed against each mirror registry.
 *
 * @param {Collector} collector instance.
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
exports.execute = function execute(collector, endpoint, done) {
  async.map(collector.feed, function get(module, next) {
    var target = url.format({
      protocol: endpoint.protocol,
      pathname: endpoint.pathname + module.id,
      host: endpoint.host
    });

    //
    // Fetch documents, ignore errors by setting the body to an empty JSON
    // object representation, mapping should continue for other modules.
    // Deleted modules will respond with statusCode = 404, so ignore that as well.
    //
    request(target, function get(error, response, body) {
      if (error || (response.statusCode !== 200 && exports.error(body))) body = null;
      next(null, exports.diff(module.doc, body));
    });
  }, function calc(error, result) {
    if (error) return done(error);
    var filtered = []
      , lag = [];

    //
    // Store the names of the modules the are lagging.
    //
    result.forEach(function each(test) {
      if (test.lag > 0) filtered.push(test.module);
      lag.push(test.lag);
    });

    done(null, {
      modules: filtered,
      lag: collector.calculate(lag)
    });
  });
};