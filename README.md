npm-probe
=========

Probe npm registries for statistics

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

### Probes

#### npm-probe: ping

#### npm-probe: delta

#### npm-probe: publish

This probe is designed to publish to the [npmjs.org registry]. In semver the version
is updated as follows:
- patch: incremented each publish, resets to 0 when the minor is updated
- minor: current day of the year
- major: current year

[npmjs.org registry]: http://registry.npmjs.org/