'use strict';

var fuse = require('fusing');

/**
 * Factory method for probes.
 *
 * @param {String} name Probe name.
 * @param {Number} interval Timing specifications.
 * @returns {Probe} fused constructor
 * @api private
 */
module.exports = function factory(name, interval) {
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
    // Name of the probe, the registries the probe should run against
    // and how often it should run.
    //
    this.readable('name', name);
    this.readable('collector', collector);
    this.readable('list', Object.keys(require('../registries')));

    //
    // How often should the probe run.
    //
    this.readable('interval', interval);
  }

  //
  // Add EventEmitter capactities and return the constructor.
  //
  fuse(Probe, require('events').EventEmitter);
  return Probe;
};