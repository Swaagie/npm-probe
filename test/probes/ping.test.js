describe('Probe: ping', function () {
  'use strict';

  var common = require('../common')
    , Collector = common.Collector
    , expect = common.expect
    , registries = common.registries
    , ping = require('../../probes/ping');

  it('exposes properties name, spec and execute', function () {
    expect(ping).to.have.property('name', 'ping');
    expect(ping).to.have.property('spec');
    expect(ping.spec).to.be.an('object');
    expect(ping).to.have.property('execute');
    expect(ping.execute).to.be.a('function');
  });

  it('has specifications to ping endpoint every 10 seconds', function () {
    expect(ping.spec).to.have.property('minute');
    expect(ping.spec.minute).to.be.an('object');
    expect(ping.spec.minute).to.have.property('start', 0);
    expect(ping.spec.minute).to.have.property('end', 60);
    expect(ping.spec.minute).to.have.property('step', 3);
  });

  it('returns the pingtime to host in milleseconds', function (done) {
    this.timeout(2E4); // Spawning a child process takes some time.
    ping.execute(new Collector, registries.nodejitsu, function (error, results) {
      expect(error).to.equal(null);
      expect(results).to.be.an('object');
      expect(results).to.have.property('minimum');
      expect(results).to.have.property('maximum');
      expect(results).to.have.property('stdev');
      expect(results).to.have.property('mean');

      for (var key in results) {
        expect(results[key]).to.be.an('number');
        expect(results[key]).to.be.above(0);
      }

      done();
    });
  });
});