const FormData = require('form-data');

function toCSV(data) {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => row[h]).join(','));
  return [headers.join(','), ...rows].join('\n');
}

module.exports = function (RED) {
  const axios = require('axios');
  const CORESERVICE_API_HOST = process?.env?.CORESERVICE_API_HOST;
  let token = process?.env?.CORESERVICE_API_TOKEN;
  const userId = parseInt(process?.env?.USER_ID);
  const appId = parseInt(process?.env?.APP_ID);

  function PlatmaInbuildDb(config) {
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
      let tableName =
        msg.table?.name ?? msg.tableName ?? config.tablename ?? null;
      let tableId = msg.table?.id ?? msg.tableId ?? null;
      let tableItem = msg.table?.item ?? msg.tableItem ?? null;
      let tableItems = msg.table?.items ?? msg.tableItems ?? [];
      let tableFilter = msg.table?.filter ?? msg.tableFilter ?? null;
      let tableIdToDel = msg.tableIdToDel;

      if (!tableName) {
        node.error(RED._('platma-inbuilddb.errors.no-configured'));
        node.status({
          fill: 'red',
          shape: 'dot',
          text: 'Error. No configured',
        });
        nodeDone();
        return;
      }

      if (tableName && config.method) {
        operation = config.method;

        const isTableIdNeeds =
          config.method === 'getone' ||
          config.method === 'change' ||
          config.method === 'delete';
        const isTableItem =
          config.method === 'store' ||
          config.method === 'change' ||
          config.method === 'changefiltered';
        const isTableItems = config.method === 'storemany';

        if (config.method === 'delete') {
          tableId = tableIdToDel;
        }

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

        if (isTableItems && !tableItems) {
          node.error(RED._('platma-inbuilddb.errors.no-tableItems'));
          node.status({
            fill: 'red',
            shape: 'dot',
            text: 'Error. No tableItems',
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
        const isListFiltered =
          !!tableName && !tableItem && !tableIdToDel && !tableItems;
        const isCreateRow =
          !!tableName &&
          !!tableItem &&
          !tableId &&
          !tableIdToDel &&
          !tableItems;
        const isCreateRows =
          !!tableName &&
          !!tableItems &&
          !tableId &&
          !tableIdToDel &&
          !tableItem;
        const isUpdateRow =
          !!tableName &&
          !!tableItem &&
          !!tableId &&
          !tableIdToDel &&
          !tableItems;
        const isDeleteRow =
          !!tableName &&
          !tableItem &&
          !tableId &&
          !!tableIdToDel &&
          !tableItems;

        byTableId = tableId ? `?id=eq.${tableId}` : '';
        byFilter = tableFilter || '';
        if (isListFiltered) {
          operation = 'list';
        } else if (isCreateRow) {
          operation = 'create';
        } else if (isCreateRows) {
          operation = 'multi_create';
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

      let url = `${CORESERVICE_API_HOST}/tooljet_db/organizations/node-red/$%7B${tableName}%7D${byTableId}${byFilter}`;
      if (operation === 'multi_create' || config.method === 'storemany') {
        url = `${CORESERVICE_API_HOST}/tooljet_db/organizations/${userId}/table/${tableName}/bulk-upload`;
      }
      let method;

      if (operation === 'getall') {
        method = 'get';
      } else if (operation === 'getone') {
        method = 'get';
      } else if (['getfiltered', 'list'].includes(operation)) {
        method = 'get';
      } else if (
        ['store', 'create', 'multi_create', 'storemany'].includes(operation)
      ) {
        method = 'post';
      } else if (['change', 'update', 'changefiltered'].includes(operation)) {
        method = 'put';
      } else if (['delete', 'deletefiltered'].includes(operation)) {
        method = 'delete';
      }
      msg.url = url;
      msg.method = method;
      let headers = {
        Authorization: `Bearer ${token}`,
        userId,
        appId,
      };

      let data = { ...tableItem };

      let csvString;
      let formData;

      if (operation === 'multi_create' || config.method === 'storemany') {
        csvString = toCSV(tableItems);

        formData = new FormData();
        formData.append('file', Buffer.from(csvString), 'table.csv');
        formData.append('meta', JSON.stringify({ someExtraField: 123 }));

        headers = {
          ...headers,
          ...formData.getHeaders(),
        };

        data = formData;
      }
      axios({
        method,
        url,
        headers,
        data,
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

  RED.httpAdmin.get('/platma-inbuilddb/tables', async function (req, res) {
    let headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      userid: userId,
      appid: appId,
    };

    try {
      const response = await axios.post(
        `${CORESERVICE_API_HOST}/tooljet_db/organizations/node-red-request`,
        {
          get: { tables: 'all' },
        },
        { headers: headers },
      );

      res.json({ tables: response.data.tables || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  RED.nodes.registerType('platma-inbuilddb', PlatmaInbuildDb);
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
    if (msg.res && typeof msg.res.status === 'function') {
      msg.res.status(500).send('Internal Server Error');
    }
    return;
  }
  nodeDone();
}
