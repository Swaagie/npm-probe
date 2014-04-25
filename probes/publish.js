'use strict';

var fs = require('fs')
  , npm = require('npm')
  , path = require('path')
  , fuse = require('fusing')
  , request = require('request')
  , schedule = require('node-schedule');

//
// Time interval for the probe.
//
var interval = 36E4;

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
  // Add _auth if username and password are provided via options.
  //
  var config = collector.options.npm || { loglevel: 'silent' };
  if (config.username && config.password) {
    config._auth = new Buffer(config.username +':'+ config.password).toString('base64');
  }

  //
  // Name of the probe and the registries the probe should run against.
  //
  this.readable('name', 'publish');
  this.readable('list', ['npmjs']);
  this.readable('config', config);
  this.readable('collector', collector);

  //
  // References to the test package that will be published.
  //
  this.readable('live', require('../registries').npmjs.href + 'npm-publish-probe');
  this.readable('map', path.join(__dirname, '..', 'publish'));
  this.readable('package', path.join(this.map, 'package.json'));
  this.writable('module', require(this.package));

  //
  // Publish the test module every 6 minutes.
  //
  this.readable('spec', {
    minute: new schedule.Range(0, 60, interval / 6E4)
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
  var result = {}
    , probe = this;

  //
  // Configure npm, read the package and update.
  //
  npm.load(probe.config, function loaded(error) {
    if (error) return done(error);

    //
    // Get the latest details from the registry.
    //
    request(probe.live, function viewed(error, response, pkg) {
      if (error || response.statusCode !== 200) return done(error);

      //
      // Attempt to update the semver of the test-module and write to file.
      //
      try { pkg = probe.update(pkg); } catch(error) { return done(error); }
      fs.writeFile(probe.package, pkg, 'utf-8', function written(error) {
        if (error) return done(error);

        //
        // Start measuring publish time.
        //
        result.start = Date.now();
        npm.commands.publish([ probe.map ], function published(error) {
          result = probe.process(error, result);

          probe.emit('publish::executed', result);
          done(error, result);
        });
      });
    });
  });
});

/**
 * Update the test package version number with a specific iterator.
 *
 * @param {String} specs Module content returned by the live registry.
 * @return {String} JSON stringified content of the test module's package.json
 * @api private
 */
Probe.readable('update', function update(specs) {
  var now = new Date
    , year = now.getFullYear()
    , days;

  //
  // Parse the latest version from the retrieved specs and calculate the number of
  // days that have passed since the beginning of the year.
  //
  specs = JSON.parse(specs)['dist-tags'].latest.split('.').map(Number);
  days = Math.ceil((now - new Date(specs[0], 0, 1)) / 864E5);

  //
  // Update the processed data where the semver will follow
  // the pattern: year.dayofyear.increment
  //
  specs[2] = days !== specs[1] ? 0 : ++specs[2];
  specs[1] = days;
  specs[0] = year;

  this.module.version = specs.join('.');
  return JSON.stringify(this.module, null, 2);
});

/**
 * Calculate the time required for the publish and notify on errors.
 *
 * @param {Error} error Publish errors
 * @param {Object} result Current probe's results
 * @return {Object} Processed results
 * @api private
 */
Probe.readable('process', function process(error, result) {
  if (error) result.error = error.message;

  result.published = !error;
  result.end = Date.now();
  result.time = result.end - result.start;

  return result;
});

/**
 * Calculate percentage of completed publishes per day.
 *
 * @param {Array} memo Container to store results in.
 * @param {Object} probe Results from probe.
 * @return {Object} altered memo.
 * @api private
 */
Probe.transform = function transform(memo, probe, i, stack) {
  var day = new Date().setHours(0, 0, 0, 0)
    , diff = probe.start > day ? probe.start - day : 864E5
    , done = Math.floor(diff / interval)
    , state = +probe.results.published;

  //
  // d3 will expect two values (e.g. success and failure rate) per day,
  // keep track of the latest publish probe state on both stacks.
  //
  if (done > memo[state].total) memo[0].total = memo[1].total = done;

  memo[state].n++;
  memo[state].percentage = Math.round(memo[state].n / memo[state].total * 100);

  //
  // Store the success percentage on failure to set lower bound.
  //
  memo[0].lower = memo[1].percentage;
  return memo;
};

/**
 * Return custom content to be displayed as latest measurement.
 *
 * @param {Array} transformed Data transformed with transform
 * @param {Array} plain Orginal data.
 * @returns {Object}
 * @api private
 */
Probe.latest = function latest(transformed, plain) {
  return transformed[transformed.length - 1];
};

/**
 * Group functionality by time, this will group per day.
 *
 * @param {Number} time Unix timestamp.
 * @returns {Date}
 * @api public
 */
Probe.group = function group(time) {
  return new Date(time).setHours(0, 0, 0, 0);
};

//
// Default stack to map and process results.
//
Probe.map = ['failure', 'success'].map(function map(key) {
  return {
    percentage: 0,
    type: key,
    lower: 0,
    total: 0,
    n: 0,
  };
});

//
// Export the probe.
//
module.exports = Probe;