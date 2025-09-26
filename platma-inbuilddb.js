const FormData = require('form-data');
function toCSV(data) {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => row[h]).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function formatOrder(o) {
  return `${encodeURIComponent(o.column)}.${o.direction}`;
}

const substituteValue = {
  'is null': 'null',
  'is true': 'true',
  'is false': 'false',
  'is unknown': 'unknown',
};

function formatFilter(f) {
  if (!f.operator) return '';
  let val = f.value;
  if (f.operator in substituteValue) {
    val = substituteValue[f.operator];
    f.operator = 'is';
  }
  if (Array.isArray(val)) val = `(${val.join(',')})`;
  return `${encodeURIComponent(f.column)}=${f.operator}.${encodeURIComponent(
    val,
  )}`;
}

function constructFilter(filters, limit, offset, orders) {
  let params = [];

  if (filters?.length) {
    filters.forEach((f) => {
      const filterStr = formatFilter(f);
      if (filterStr) params.push(filterStr);
    });
  }

  if (orders?.length) {
    const orderStr = orders.map(formatOrder).join('%2C');
    if (orderStr && orderStr !== '.asc' && orderStr !== '.desc')
      params.push(`order=${orderStr}`);
  }

  if (limit) params.push(`limit=${limit}`);
  if (offset) params.push(`offset=${offset}`);

  return params.join('&');
}

const isEmpty = (v) =>
  v == null ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

module.exports = function (RED) {
  const axios = require('axios');
  const CORESERVICE_API_HOST = process?.env?.CORESERVICE_API_HOST;
  let token = process?.env?.CORESERVICE_API_TOKEN;
  const userId = parseInt(process?.env?.USER_ID);
  const appId = parseInt(process?.env?.APP_ID);

  function resolveTypedInputSync(typedInput, msg, node) {
    if (!typedInput) return undefined;

    const { type, value } = typedInput;

    switch (type) {
      case 'num':
        return Number(value);
      case 'str':
        return String(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      case 'msg':
        return msg[value];
      case 'flow':
        return node.context().flow?.get(value);
      case 'global':
        return node.context().global?.get(value);
      case 'env':
        return process.env[value] || null;
      case 'jsonata':
      default:
        return value;
    }
  }

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

      console.log({
        rawId: config.rawId,
        item: config.item,
        items: config.items,
      });

      let rawId =
        config.rawId && config.rawId?.value
          ? resolveTypedInputSync(config.rawId, msg, node)
          : null;
      let item =
        config.item && config.item?.value && !isEmpty(config.item)
          ? resolveTypedInputSync(config.item, msg, node)
          : null;
      let items =
        config.items && config.items?.value && !isEmpty(config.items)
          ? resolveTypedInputSync(config.items, msg, node)
          : null;
      let idForDel =
        config.idForDel && config.idForDel?.value
          ? resolveTypedInputSync(config.idForDel, msg, node)
          : null;

      let filter =
        (config.filter ?? []).length > 0
          ? constructFilter(
              config.filter.map((item) => {
                return {
                  column: resolveTypedInputSync(
                    { value: item.column, type: item.columnType },
                    msg,
                    node,
                  ),
                  operator: item.operator,
                  value: resolveTypedInputSync(
                    { value: item.value, type: item.type },
                    msg,
                    node,
                  ),
                };
              }),
              resolveTypedInputSync(config.limit, msg, node),
              resolveTypedInputSync(config.offset, msg, node),
              config.order.map((item) => {
                return {
                  column: resolveTypedInputSync(
                    { value: item.column, type: item.columnType },
                    msg,
                    node,
                  ),
                  direction: item.direction,
                };
              }),
            )
          : null;

      console.log({
        rawId,
        item,
        items,
        idForDel,
        filter,
      });

      let operation, byTableId, byFilter;
      let tableName =
        msg.table?.name ?? msg.tableName ?? config.tablename ?? null;
      let tableId = msg.table?.id ?? msg.tableId ?? rawId ?? null;
      let tableItem = msg.table?.item ?? msg.tableItem ?? item ?? null;
      let tableItems = msg.table?.items ?? msg.tableItems ?? items ?? [];
      let tableFilter = msg.table?.filter ?? msg.tableFilter ?? filter ?? null;
      let tableIdToDel = msg.tableIdToDel ?? idForDel ?? null;

      console.log({
        tableIdToDel,
        tableFilter,
        tableItems,
        tableItem,
        tableId,
      });

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

      console.log({
        tableName: tableName,
        method: config.method,
      });

      if (config.tableName && config.method) {
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
          !(tableItems && tableItems.length > 0);
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
          !(tableItems && tableItems.length > 0);
        const isDeleteRow =
          !!tableName &&
          !tableItem &&
          !tableId &&
          !!tableIdToDel &&
          !(tableItems && tableItems.length > 0);

        byTableId = tableId ? `?id=eq.${tableId}` : '';
        byFilter = tableFilter || '';

        console.log({
          isCreateRow,
          isCreateRows,
          isDeleteRow,
          isListFiltered,
          isUpdateRow,
          byTableId,
          byFilter,
          operation,
        });

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

        console.log({
          isCreateRow,
          isCreateRows,
          isDeleteRow,
          isListFiltered,
          isUpdateRow,
          byTableId,
          byFilter,
          operation,
        });
      }

      node.status({
        fill: 'blue',
        shape: 'dot',
        text: 'platma-inbuilddbp.status.requesting',
      });

      if (!byTableId) byFilter = '?' + byFilter;

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
    token = process?.env?.CORESERVICE_API_TOKEN;

    let headers = {
      authorization: `Bearer ${token}`,
      userid: userId,
      appid: appId,
    };

    let body = {
      get: { tables: 'all' },
    };

    try {
      const response = await axios.post(
        `${CORESERVICE_API_HOST}/tooljet_db/organizations/node-red-request`,
        body,
        { headers: headers },
      );

      res.json({ tables: response.data.data.tables || [] });
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
