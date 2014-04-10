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
  this.readable('name', 'publish');
  this.readable('collector', collector);
  this.readable('list', [ 'npmjs' ]);

  //
  // Publish the test module every 6 minutes.
  //
  this.readable('spec', {
    minute: new schedule.Range(0, 60, 6)
  });
}

fuse(Probe, require('events').EventEmitter);

/**
 * Publish a module and check if the latest details are available in every endpoint.
 *
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
Probe.readable('execute', function execute(endpoint, done) {
});

//
// Export the probe.
//
module.exports = Probe;