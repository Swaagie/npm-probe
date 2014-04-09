'use strict';

var url = require('url')
  , async = require('async')
  , request = require('request')
  , schedule = require('node-schedule');

//
// Name of the probe.
//
exports.name = 'publish';

//
// List of registries the probe should be run against.
//
exports.list = [ 'npmjs' ];

//
// Publish the test module every 6 minutes.
//
exports.spec = {
  minute: new schedule.Range(0, 60, 6)
};

/**
 * Publish a module and check if the latest details are available in every endpoint.
 *
 * @param {Collector} collector instance.
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
exports.execute = function execute(collector, endpoint, done) {
};