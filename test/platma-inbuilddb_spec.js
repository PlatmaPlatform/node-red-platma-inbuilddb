const helper = require('node-red-node-test-helper');
const lowerNode = require('../platma-inbuilddb.js');

describe('platma-inbuilddb Node', function () {
  afterEach(function () {
    helper.unload();
  });

  it('should be loaded', function (done) {
    const flow = [{ id: 'n1', type: 'platma-inbuilddb', name: 'platma-inbuilddb' }];
    helper.load(lowerNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1.should.have.property('name', 'platma-inbuilddb');
      done();
    });
  });
});
