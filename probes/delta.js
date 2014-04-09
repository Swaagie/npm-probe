'use strict';

var url = require('url')
  , async = require('async')
  , request = require('request')
  , diff = require('objectdiff')
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
 * @return {Number} Absolute lag in msec
 * @api private
 */
exports.lag = function lag(equal, origin, variation) {
  var main = 0
    , mirror = 0;

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
  // Return absolute lag in msec, the value has to be absoluted
  //
  return Math.abs(mirror - main);
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
 * Check the last changes feed against each mirror registry.
 *
 * @param {Collector} collector instance.
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
exports.execute = function execute(collector, endpoint, done) {
  async.map(collector.feed, function get(module, next) {
    endpoint.pathname = '/' + module.id;

    //
    // Fetch documents, ignore errors by setting the body to an empty JSON
    // object representation, mapping should continue for other modules.
    // Deleted modules will respond with statusCode = 404, so ignore that as well.
    //
    request(url.format(endpoint), function get(error, response, body) {
      if (error || ~body.indexOf('"error":"not_found"')) body = null;
      next(null, exports.diff(module.doc, body));
    });
  }, function calc(error, result) {
    if (error) return done(error);
    done(null, collector.calculate(result));
  });
};
