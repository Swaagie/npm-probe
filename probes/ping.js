'use strict';

var ping = require('pinger')
  , async = require('async');

//
// Name of the probe.
//
exports.name = 'ping';

//
// Specifications when the probe should be run. Ping will be ran every 30 seconds.
//
exports.spec = {
  second: [0, 10, 20, 30, 40, 50]
};

/**
 * Ping the endpoint.
 *
 * @param {Collector} collector instance.
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
exports.execute = function (collector, endpoint, done) {
  ping(endpoint.host, done);
};