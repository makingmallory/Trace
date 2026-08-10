/**
 * Trace Milestone 0.5 sync spike only.
 *
 * This script accepts one non-sensitive test record. It is not production sync,
 * authentication, backup, recovery, conflict handling, or a health-data API.
 *
 * @OnlyCurrentDoc
 */

const SPIKE_SHEET_NAME = 'SyncSpike';
const SPIKE_HEADERS = ['id', 'value', 'createdAt', 'receivedAt'];

function doGet(event) {
  try {
    const action = event && event.parameter ? event.parameter.action : '';

    if (action === 'healthCheck') {
      const spreadsheet = getSpreadsheet_();
      getOrCreateSpikeSheet_(spreadsheet);
      return jsonSuccess_({
        service: 'trace-apps-script-sync-spike',
        sheetName: spreadsheet.getName(),
      });
    }

    if (action === 'readTestRecord') {
      const recordId = event.parameter.recordId || '';
      validateRecordId_(recordId);
      return jsonSuccess_({ record: readTestRecord_(recordId) });
    }

    throw new Error('Unsupported GET action.');
  } catch (error) {
    return jsonError_(error);
  }
}

function doPost(event) {
  try {
    if (!event || !event.postData || !event.postData.contents) {
      throw new Error('A request body is required.');
    }

    const request = JSON.parse(event.postData.contents);

    if (!request || request.action !== 'pushTestRecord') {
      throw new Error('Unsupported POST action.');
    }

    const record = validateRecord_(request.record);
    writeTestRecord_(record);
    return jsonSuccess_({ record: record });
  } catch (error) {
    return jsonError_(error);
  }
}

function getSpreadsheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error('This Apps Script project must be bound to a Google Sheet.');
  }

  return spreadsheet;
}

function getOrCreateSpikeSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SPIKE_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SPIKE_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SPIKE_HEADERS.length).setValues([SPIKE_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function writeTestRecord_(record) {
  const sheet = getOrCreateSpikeSheet_(getSpreadsheet_());
  const values = sheet.getDataRange().getDisplayValues();
  let targetRow = sheet.getLastRow() + 1;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (values[rowIndex][0] === record.id) {
      targetRow = rowIndex + 1;
      break;
    }
  }

  sheet.getRange(targetRow, 1, 1, SPIKE_HEADERS.length).setValues([[
    record.id,
    record.value,
    record.createdAt,
    new Date().toISOString(),
  ]]);
  SpreadsheetApp.flush();
}

function readTestRecord_(recordId) {
  const sheet = getOrCreateSpikeSheet_(getSpreadsheet_());
  const values = sheet.getDataRange().getDisplayValues();

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (values[rowIndex][0] === recordId) {
      return {
        id: values[rowIndex][0],
        value: values[rowIndex][1],
        createdAt: values[rowIndex][2],
      };
    }
  }

  return null;
}

function validateRecord_(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('The test record is missing.');
  }

  validateRecordId_(record.id);

  if (
    typeof record.value !== 'string' ||
    record.value.length < 1 ||
    record.value.length > 250
  ) {
    throw new Error('The test value must be 1 to 250 characters.');
  }

  if (/^[=+\-@]/.test(record.value)) {
    throw new Error('Formula-like test values are not allowed.');
  }

  if (
    typeof record.createdAt !== 'string' ||
    Number.isNaN(Date.parse(record.createdAt))
  ) {
    throw new Error('The test record timestamp is invalid.');
  }

  return {
    id: record.id,
    value: record.value,
    createdAt: record.createdAt,
  };
}

function validateRecordId_(recordId) {
  if (
    typeof recordId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,100}$/.test(recordId)
  ) {
    throw new Error('The test record ID is invalid.');
  }
}

function jsonSuccess_(data) {
  return jsonOutput_({ ok: true, data: data });
}

function jsonError_(error) {
  const message = error && error.message ? error.message : 'Unknown error.';
  return jsonOutput_({ ok: false, error: message });
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
