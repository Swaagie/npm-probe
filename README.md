# npm-probe [![Build Status][status]](https://travis-ci.org/Moveo/npm-probe) [![NPM version][npmimgurl]](http://npmjs.org/package/npm-probe) [![Coverage Status][coverage]](http://coveralls.io/r/Moveo/npm-probe?branch=master)
Probe npm registries for statistics

[status]: https://travis-ci.org/Moveo/npm-probe.png?branch=master
[npmimgurl]: https://badge.fury.io/js/npm-probe.png
[coverage]: http://coveralls.io/repos/Moveo/npm-probe/badge.png?branch=master

### Usage

Instantiate a new npm-probe instance which will collect statistics from npm
registries and mirrors. If you'd like to run the instance without actively
gathering data, provide the flag `silent: true`.

```
var Collector = require('npm-probe');
  , collector = new Collector({
      npm: nodejitsu.config.get('npm'),
      probes: [ Collector.probes.ping ],
      silent: false
    });
```

Active execution of the probes can be prevented by setting the following
environment variable: `PROBE=silent`. This allows you to use the collector as
static instance to access cache or other methods.

### Registries

Providing an alternative or reduced list of registries is possible by setting
`options.registries`. The list should be an object with unique registry names,
see `registries.json` for an example.

### Probes

#### npm-probe: ping

The ping probe will perform 5 parallel request to the database page of each
registry's CouchDB. The response time of these 5 request are averaged and
statistics (min, max, stdev) will be calculated.

#### npm-probe: delta

This probe works on the back of the SkimDB feed follower. Modules stored in the feed
collection will be checked against each listed registry/mirror. The lag is
determined from the latest known update time for each module. The difference is
calculated in milliseconds. Only modules that are lagging, e.g. have a difference > 0
will be included in the statistics.

#### npm-probe: publish

This probe is designed to publish to the [npmjs.org registry] and can be used to
check publishing consistency and actual duration. The semantic version is updated
as follows:

- patch: incremented each publish, resets to 0 when the minor is updated
- minor: current day of the year
- major: current year

### Development

To contribute, simply clone the repository and submit pull requests. Please
provide unit tests with each change.

```
git clone git@github.com:Moveo/npm-probe.git
```

If you like to design a custom probe, note that the following methods should be
available on the API of the probe. The parameters will be provided
from the main `Collector` instance. In addition to that [fusing] is available to
create read-only properties on the probe.

To aquire a predefined Probe constructor the factory method `Collector.create`
can be used. After add all API methods to the provided constructor. Make sure that
the time schedule specifications are compatible with [node-schedule].

```js
require('npm-probe').create(
  'mycustomprobe',                           // name of the probe
  { minute: new schedule.Range(0, 60, 1) }   // time schedule
);
```

#### Probe.prototype.execute

Actual logic that gets executed whenever the timing schedule triggers a run.

- @param {Object} endpoint URL parsed endpoint.
- @param {Function} done Completion callback.
- @api public

#### Probe.transform

Return transformed data, this can be done via grouping or calculating moving
averages or any other map reduce methodology.

- @param {Object} memo Data.
- @param {Object} probe Measurements of single probe.
- @param {Number} i Current iteration.
- @param {Array} stack Complete serie of measurements.
- @returns {object} altered memo

#### Probe.latest

Return the value that should be used as latest value.

- @param {Array} transformed Data transformed with transform
- @param {Array} plain Orginal data.
- @returns {Mixed} string or numeric value

#### Probe.group

Group functionality by time, group per millisecond, hour or day.

- @param {Number} time Unix timestamp.
- @returns {Number} Unique identifier for the group.

#### Probe.group

- @type {Object} Default representation of grouped results.

[fusing]: https://github.com/bigpipe/fusing
[npmjs.org registry]: http://registry.npmjs.org/
[node-schedule]: https://github.com/mattpat/node-schedule