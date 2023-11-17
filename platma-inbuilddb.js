module.exports = function (RED) {
  const axios = require('axios');
  function PlatmaInbuildDb(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.on('input', function (msg, nodeSend, nodeDone) {
      if (!msg?.req?.headers?.authorization || !msg?.req?.headers?.coreservice) {
        node.error(RED._('platma-inbuilddb.errors.no-user-data'), msg);
        node.status({ fill: 'yellow', shape: 'dot', text: 'Error. No user data' });
        nodeDone();
        return;
      }

      const token = msg.req.headers.authorization.split('Bearer ')[1];
      const coreservice = msg.req.headers.coreservice;

      if (!token) {
        node.error(RED._('platma-whoami.errors.no-valid-user-data'), msg);
        node.status({ fill: 'yellow', shape: 'dot', text: 'Error. No valid user data' });
        nodeDone();
        return;
      }

      node.status({
        fill: 'green',
        shape: 'dot',
        text: 'http-request-np.status.requesting',
      });

      axios({
        method: 'get',
        url: `${coreservice}/users/me`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => {
          const platmaUser = res?.data?.user;
          platmaUser.uiApps = null;
          msg.platmaUser = platmaUser;

          node.status({});
          nodeSend(msg);
          nodeDone();
        })
        .catch((err) => {
          if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
            node.error(RED._('common.notification.errors.no-response'), msg);
            node.status({
              fill: 'red',
              shape: 'ring',
              text: 'common.notification.errors.no-response',
            });
          } else {
            node.error(err, msg);
            node.status({ fill: 'red', shape: 'ring', text: err.code });
          }
          msg.payload = err.toString();
          msg.statusCode =
            err.code || (err.response ? err.response.statusCode : undefined);

          if (!config.senderr) {
            nodeSend(msg);
          }
          nodeDone();
        });
    });

    node.on('close', function () {
      node.status({});
    });
  }
  RED.nodes.registerType('platma-inbuilddb', PlatmaInbuildDb);
};
