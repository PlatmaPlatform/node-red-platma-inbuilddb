const axios = require("axios");
module.exports = function (RED) {
  const axios = require('axios');
  const CORESERVICE_API_HOST = process?.env?.CORESERVICE_API_HOST;
  const token = process?.env?.CORESERVICE_API_TOKEN;
  const userId = parseInt(process?.env?.USER_ID);
  const appId = parseInt(process?.env?.APP_ID);

  function PlatmaInbuildDb(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.on('input', function (msg, nodeSend, nodeDone) {

      if (!CORESERVICE_API_HOST || !token || !userId || !appId){
        node.error(RED._('platma-inbuilddb.errors.lack-envs'));
        node.status({ fill: 'red', shape: 'dot', text: 'Error. There is a lack of env data' });
        nodeDone();
        return;
      }

      node.status({
        fill: 'green',
        shape: 'dot',
        text: 'platma-inbuilddb.status.requesting',
      });

      if (!config.method || !config.tablename) {
        node.error(RED._('platma-inbuilddb.errors.no-configured'));
        node.status({ fill: 'red', shape: 'dot', text: 'Error. No configured' });
        nodeDone();
        return;
      }

      let byTableId;
      if ((config.method === 'getone' || config.method === 'change') && !msg.tableId){
        node.error(RED._('platma-inbuilddb.errors.no-tableId'));
        node.status({ fill: 'red', shape: 'dot', text: 'Error. No tableId' });
        nodeDone();
        return;
      } else {
        byTableId = `?id=eq.${msg?.tableId}`
      }

      if ((config.method === 'getone' || config.method === 'change') && !msg.tableItem){
        node.error(RED._('platma-inbuilddb.errors.no-tableItem'));
        node.status({ fill: 'red', shape: 'dot', text: 'Error. No no-tableItem' });
        nodeDone();
        return;
      }

      node.status({
        fill: 'blue',
        shape: 'dot',
        text: 'platma-inbuilddbp.status.requesting',
      });

      if (config.method === 'getall' || config.method === 'getone') {
        axios({
          method: 'get',
          url: `${CORESERVICE_API_HOST}/tooljet_db/organizations/node-red/$%7B${config.tablename}%7D${byTableId || ''}`,
          headers: {
            Authorization: `Bearer ${token}`,
            userId,
            appId
          },
        })
            .then((res) => {
              setResponse(msg, res, node, nodeSend, nodeDone);
            })
            .catch((err) => {
              catchError(err, node, msg, config, nodeSend, nodeDone)
            });
      }  else if (config.method === 'store'){
        axios({
          method: 'post',
          url: `${CORESERVICE_API_HOST}/tooljet_db/organizations/node-red/$%7B${config.tablename}%7D`,
          headers: {
            Authorization: `Bearer ${token}`,
            userId,
            appId
          },
          data: {...msg.tableItem}
        })
            .then((res) => {
              setResponse(msg, res, node, nodeSend, nodeDone);
            })
            .catch((err) => {
              catchError(err, node, msg, config, nodeSend, nodeDone)
            });
      } else if (config.method === 'change'){
        axios({
          method: 'put',
          url: `${CORESERVICE_API_HOST}/tooljet_db/organizations/node-red/$%7B${config.tablename}%7D${byTableId}`,
          headers: {
            Authorization: `Bearer ${token}`,
            userId,
            appId
          },
          data: {...msg.tableItem}
        })
            .then((res) => {
              setResponse(msg, res, node, nodeSend, nodeDone);
            })
            .catch((err) => {
              catchError(err, node, msg, config, nodeSend, nodeDone);
            });
      }
    })


    node.on('close', function () {
      node.status({});
    });

    node.on('close', function () {
      node.status({});
    });
  }
  RED.nodes.registerType('platma-inbuilddb', PlatmaInbuildDb);
};

function setResponse(msg, res, node, nodeSend, nodeDone) {
  msg.statusCode = res.status;
  const body = res.data;
  msg.payload = {
    success: body.success,
    rawResponse: body,
  };
  node.status({});
  nodeSend(msg);
  nodeDone();
}

function catchError(err, node, msg, config, nodeSend, nodeDone) {
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    node.error(RED._('common.notification.errors.no-response'), msg);
    node.status({
      fill: 'red',
      shape: 'ring',
      text: 'common.notification.errors.no-response',
    });
  } else {
    node.error(err, msg);
    node.status({fill: 'red', shape: 'ring', text: err.code});
  }
  msg.payload = err.toString();
  msg.statusCode =
      err.code || (err.response ? err.response.statusCode : undefined);

  if (!config.senderr) {
    nodeSend(msg);
  }
  nodeDone();
}