npm-probe
=========

Probe npm registries for statistics


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