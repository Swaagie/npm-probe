'use strict';

var exec = require('child_process').exec;

//
// Name of the probe.
//
exports.name = 'ping';

//
// Specifications when the probe should be run. Ping will be ran every 30 seconds.
//
exports.spec = {
  second: [0, 30]
};

/**
 * Ping the endpoint.
 *
 * @param {Collector} collector instance.
 * @param {Object} endpoint url parsed endpoint
 * @param {Function} done completion callback.
 * @api public
 */
exports.execute = function execute(collector, endpoint, done) {
  exec('ping -c5 -q ' + endpoint.host, function process(error, output) {
    if (error) return done(error);

    output = output.slice(output.indexOf('= ') + 2, -5).split('/');

    done(null, {
      minimum: +output[0],
      average: +output[1],
      maximum: +output[2],
      deviation: +output[3]
    });
  });
};