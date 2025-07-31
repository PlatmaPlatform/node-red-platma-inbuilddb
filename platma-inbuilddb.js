const axios = require('axios');
module.exports = function (RED) {
  const axios = require('axios');
  const CORESERVICE_API_HOST = process?.env?.CORESERVICE_API_HOST;
  let token = process?.env?.CORESERVICE_API_TOKEN;
  const userId = parseInt(process?.env?.USER_ID);
  const appId = parseInt(process?.env?.APP_ID);
  let senderr = true;

  function PlatmaInbuildDb(config) {
    senderr = config.senderr;
    RED.nodes.createNode(this, config);
    const node = this;
    node.on('input', function (msg, nodeSend, nodeDone) {
      token = process?.env?.CORESERVICE_API_TOKEN;
      if (!CORESERVICE_API_HOST || !token || !userId || !appId) {
        node.error(RED._('platma-inbuilddb.errors.lack-envs'));
        node.status({
          fill: 'red',
          shape: 'dot',
          text: 'Error. There is a lack of env data',
        });
        nodeDone();
        return;
      }

      node.status({
        fill: 'green',
        shape: 'dot',
        text: 'platma-inbuilddb.status.requesting',
      });

      let operation, byTableId, byFilter;
      let tableName = msg.table.name ?? msg.tableName;
      let tableId = msg.table.id ?? msg.tableId;
      let tableItem = msg.table.item ?? msg.tableItem;
      let tableFilter = msg.table.filter ?? msg.tableFilter;
      let tableIdToDel = msg.tableIdToDel;

      if (!config.tablename && !tableName) {
        node.error(RED._('platma-inbuilddb.errors.no-configured'));
        node.status({
          fill: 'red',
          shape: 'dot',
          text: 'Error. No configured',
        });
        nodeDone();
        return;
      }

      if (config.tablename && config.method) {
        operation = config.method;

        const isTableIdNeeds =
          config.method === 'getone' ||
          config.method === 'change' ||
          config.method === 'delete';
        const isTableItem =
          config.method === 'store' ||
          config.method === 'change' ||
          config.method === 'changefiltered';

        if (isTableIdNeeds && !tableId) {
          node.error(RED._('platma-inbuilddb.errors.no-tableId'));
          node.status({ fill: 'red', shape: 'dot', text: 'Error. No tableId' });
          nodeDone();
          return;
        } else {
          byTableId = tableId ? `?id=eq.${tableId}` : '';
        }

        if (isTableItem && !tableItem) {
          node.error(RED._('platma-inbuilddb.errors.no-tableItem'));
          node.status({
            fill: 'red',
            shape: 'dot',
            text: 'Error. No tableItem',
          });
          nodeDone();
          return;
        }

        if (
          ['getfiltered', 'changefiltered', 'deletefiltered'].includes(
            config.method,
          ) &&
          !tableFilter
        ) {
          node.error(RED._('platma-inbuilddb.errors.no-tableFilter'));
          node.status({
            fill: 'red',
            shape: 'dot',
            text: 'Error. No tableFilter',
          });
          nodeDone();
          return;
        } else {
          byFilter = tableFilter || '';
        }
      } else {
        const isListFiltered = !!tableName && !tableItem && !tableIdToDel;
        const isCreateRow =
          !!tableName && !!tableItem && !tableId && !tableIdToDel;
        const isUpdateRow =
          !!tableName && !!tableItem && !!tableId && !tableIdToDel;
        const isDeleteRow =
          !!tableName && !tableItem && !tableId && !!tableIdToDel;

        byTableId = tableId ? `?id=eq.${tableId}` : '';
        byFilter = tableFilter || '';
        if (isListFiltered) {
          operation = 'list';
        } else if (isCreateRow) {
          operation = 'create';
        } else if (isUpdateRow) {
          operation = 'update';
        } else if (isDeleteRow) {
          operation = 'delete';
          byTableId = tableIdToDel ? `?id=eq.${tableIdToDel}` : '';
        } else {
          node.error(RED._('platma-inbuilddb.errors.unknown-operation'));
          node.status({
            fill: 'red',
            shape: 'dot',
            text: 'Error. A lack of arguments to predict an operation',
          });
          nodeDone();
          return;
        }
      }

      node.status({
        fill: 'blue',
        shape: 'dot',
        text: 'platma-inbuilddbp.status.requesting',
      });

      const url = `${CORESERVICE_API_HOST}/tooljet_db/organizations/node-red/$%7B${
        tableName || config.tablename
      }%7D${byTableId}${byFilter}`;
      let method;

      if (operation === 'getall') {
        method = 'get';
      } else if (operation === 'getone') {
        method = 'get';
      } else if (operation === 'getfiltered' || operation === 'list') {
        method = 'get';
      } else if (operation === 'store' || operation === 'create') {
        method = 'post';
      } else if (
        operation === 'change' ||
        operation === 'update' ||
        operation === 'changefiltered'
      ) {
        method = 'put';
      } else if (operation === 'delete' || operation === 'deletefiltered') {
        method = 'delete';
      }
      msg.url = url;
      msg.method = method;
      axios({
        method,
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          userId,
          appId,
        },
        data: { ...tableItem },
      })
        .then((res) => {
          setResponse(msg, res, node, nodeSend, nodeDone);
        })
        .catch((err) => {
          catchError(err, node, msg, config, nodeSend, nodeDone, RED);
        });
    });

    node.on('close', function () {
      node.status({});
    });

    node.on('close', function () {
      node.status({});
    });
  }
  RED.nodes.registerType('platma-inbuilddb', PlatmaInbuildDb, {
    outputs: senderr ? 2 : 1,
  });
};

function setResponse(msg, res, node, nodeSend, nodeDone) {
  msg.statusCode = res.status;
  const body = res.data;
  msg.payload = {
    success: true,
    rawResponse: body,
  };
  node.status({});
  nodeSend(msg);
  nodeDone();
}

function catchError(err, node, msg, config, nodeSend, nodeDone, RED) {
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

  if (config.senderr) {
    nodeSend([null, msg]);
  } else {
    node.error(err, msg);
    console.error('platma-inbuilddb error:', err);
    if (msg.res && typeof msg.res.status === 'function') {
      msg.res.status(500).send('Internal Server Error');
    }
    return;
  }
  nodeDone();
}
