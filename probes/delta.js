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
  second: [0, 30]
//  minute: new schedule.Range(0, 60, 10)
};


exports.equal = {
  name: function name(a, b) {
    return a && b && a === b;
  },

  time: function time(a, b) {
    return a && b && a.modified === b.modified
      && Object.keys(a).join() === Object.keys(b).join();
  },

  versions: function versions(a, b) {
    return a && b && Object.keys(a).join() === Object.keys(b).join();
  }
};

/**
 * Combine the results to a meaningful object.
 *
 * @param  {[type]} keys      [description]
 * @param  {[type]} origin    [description]
 * @param  {[type]} variation [description]
 * @return {[type]}           [description]
 */
function result(keys, origin, variation) {
  var main, mirror;

  //
  // If the document for the target npm mirror is missing, registry has lag equal
  // to module creation. Otherwise calculate the difference between modified.
  //
  if (keys.length) {
    if (origin && variation) {
      main = (new Date(origin.time.modified)).getTime();
      mirror = (new Date(variation.time.modified)).getTime();
    }

    if (!variation) {
      main = Date.now();
      mirror = (new Date(origin.time.created)).getTime();
    }
  }

  //
  // Return the results, where lag is the msec in time the registry is behind and
  // uptodate a boolean indicating if the mirror is still replicating correctly.
  //
  return {
    difference: keys,
    uptodate: !keys.length,
    lag: main - mirror
  };
}

//
// Get the difference between both objects for listed `exports.keys`.
// If the variation is missing or null then return immediatly.
//
exports.diff = function diff(origin, variation) {
  var keys = [];

  try {
    if (!variation) throw new Error('No variation doc found');
    variation = JSON.parse(variation);
  } catch (e) {
    return result(Object.keys(exports.equal), origin);
  }

  for (var check in exports.equal) {
    if (!exports.equal[check](origin[check], variation[check])) keys.push(check);
  }

  return result(keys, origin, variation);
};

/**
 * Check the last feed
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
    //
    request(url.format(endpoint), function get(error, response, body) {
      if (error || response.statusCode !== 200 || !body) body = null;
      next(null, exports.diff(module.doc, body));
    });
  }, function calc(error, result) {
      console.log(error, result)
  });
};
