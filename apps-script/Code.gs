/** Trace Milestone 5 production sync endpoint. Bound to one user-owned Sheet. @OnlyCurrentDoc */
const TRACE_FORMAT = 'trace-sync';
const SYNC_VERSION = 1;
const SCHEMA_VERSION = 2;
const MAX_BATCH_SIZE = 250;
const META_TAB = 'Meta';
const COMMON_HEADERS = ['id', 'revision', 'remoteRevision', 'createdAt', 'updatedAt', 'deletedAt', 'originDeviceId'];
const ENTITY_FIELDS = {
  categories: ['name', 'sortOrder', 'active'],
  trackables: ['categoryId', 'active', 'archivedAt', 'currentVersion', 'tags', 'dataRole', 'icon', 'colorRef', 'behavior', 'quickLogTimingMode', 'recordSemantics', 'quickLogEnabled', 'reminder'],
  trackableFields: ['ownerTrackableId', 'fieldTrackableId', 'fieldTrackableVersion', 'sortOrder', 'enabled', 'conditionalRule', 'completionBehavior', 'ownerTrackableVersion', 'required'],
  trackableDailyAssertions: ['date', 'trackableId', 'status', 'sourceRoutineId', 'recordedAt'],
  trackableVersions: ['trackableId', 'version', 'name', 'description', 'inputType', 'scaleMin', 'scaleMax', 'scaleStep', 'unit', 'valueDirection', 'configuration', 'retiredAt'],
  trackableOptions: ['optionId', 'trackableId', 'trackableVersion', 'storedValue', 'label', 'icon', 'colorRef', 'sortOrder', 'active'],
  routines: ['name', 'icon', 'active', 'scheduleType'],
  routineItems: ['routineId', 'target', 'sortOrder', 'section', 'enabled', 'frequency', 'weekdays', 'conditionalRule', 'completionBehavior', 'trendTrackingMode', 'eventReminderBehavior'],
  eventDefinitions: ['name', 'description', 'categoryId', 'icon', 'colorRef', 'timingMode', 'dataRole', 'active', 'nightlyReminderDefault', 'treatmentFollowUpEnabled'],
  eventFields: ['eventDefinitionId', 'trackableId', 'trackableVersion', 'sortOrder', 'enabled', 'conditionalRule', 'completionBehavior'],
  logRecords: ['recordKind', 'routineId', 'eventDefinitionId', 'eventTimingKind', 'localDate', 'startTimePrecision', 'startTime', 'startTimeOfDay', 'endLocalDate', 'endTimePrecision', 'endTime', 'endTimeOfDay', 'ongoing', 'timezone', 'status', 'source', 'trackableId', 'trackableVersion'],
  observations: ['logRecordId', 'trackableId', 'trackableVersion', 'answer', 'trendValue', 'customChoiceValue'],
  observationSelections: ['observationId', 'optionId'],
  eventDailyAssertions: ['date', 'eventDefinitionId', 'status', 'sourceRoutineId', 'recordedAt'],
  relationships: ['sourceRecordId', 'targetRecordId', 'relationshipType', 'provenance', 'confirmedByUser', 'metadata'],
  relationshipAssessments: ['relationshipId', 'assessmentType', 'trackableId', 'value', 'recordedAt'],
  settings: ['schemaVersion', 'themeId', 'reducedMotion', 'locale', 'dateFormat', 'timeFormat', 'firstDayOfWeek', 'units', 'dailyCheckInReminder'],
};
const TAB_NAMES = {
  categories: 'Categories', trackables: 'Trackables', trackableVersions: 'TrackableVersions',
  trackableFields: 'TrackableFields', trackableDailyAssertions: 'TrackableDailyAssertions',
  trackableOptions: 'TrackableOptions', routines: 'Routines', routineItems: 'RoutineItems',
  eventDefinitions: 'EventDefinitions', eventFields: 'EventFields', logRecords: 'LogRecords',
  observations: 'Observations', observationSelections: 'ObservationSelections',
  eventDailyAssertions: 'EventDailyAssertions', relationships: 'Relationships',
  relationshipAssessments: 'RelationshipAssessments', settings: 'Settings',
};

function doGet(event) {
  try {
    const action = event && event.parameter ? event.parameter.action : '';
    if (action === 'healthCheck' || action === 'getMetadata') return jsonSuccess_(metadata_());
    if (action === 'pullAll') return jsonSuccess_(pullChanges_(0));
    if (action === 'pullChanges') return jsonSuccess_(pullChanges_(nonnegativeInteger_(event.parameter.checkpoint, 'checkpoint')));
    if (action === 'readTestRecord') return jsonSuccess_({ record: readTestRecord_(event.parameter.recordId || '') });
    throw new Error('Unsupported GET action.');
  } catch (error) { return jsonError_(error); }
}

function doPost(event) {
  try {
    if (!event || !event.postData || !event.postData.contents) throw new Error('A request body is required.');
    const request = JSON.parse(event.postData.contents);
    if (request.action === 'pushBatch') return jsonSuccess_(pushBatch_(request));
    if (request.action === 'pushTestRecord') { writeTestRecord_(validateTestRecord_(request.record)); return jsonSuccess_({ record: request.record }); }
    throw new Error('Unsupported POST action.');
  } catch (error) { return jsonError_(error); }
}

function spreadsheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('This Apps Script project must be bound to a Google Sheet.');
  return spreadsheet;
}

function ensureWorkbook_() {
  const spreadsheet = spreadsheet_();
  const meta = ensureSheet_(spreadsheet, META_TAB, ['key', 'value']);
  const values = meta.getDataRange().getValues();
  const map = {};
  for (let row = 1; row < values.length; row += 1) map[String(values[row][0])] = String(values[row][1]);
  let schemaUpgradeRow = 0;
  if (!map.format) {
    meta.getRange(2, 1, 5, 2).setValues([
      ['format', TRACE_FORMAT], ['syncVersion', SYNC_VERSION], ['schemaVersion', SCHEMA_VERSION],
      ['checkpoint', 0], ['createdAt', new Date().toISOString()],
    ]);
  } else if (map.format !== TRACE_FORMAT || Number(map.syncVersion) !== SYNC_VERSION || Number(map.schemaVersion) > SCHEMA_VERSION) {
    throw new Error('This spreadsheet contains an incompatible Trace dataset.');
  } else if (Number(map.schemaVersion) < SCHEMA_VERSION) {
    for (let row = 1; row < values.length; row += 1) {
      if (String(values[row][0]) === 'schemaVersion') schemaUpgradeRow = row + 1;
    }
  }
  Object.keys(ENTITY_FIELDS).forEach(function(type) { ensureEntitySheet_(spreadsheet, type); });
  if (schemaUpgradeRow) meta.getRange(schemaUpgradeRow, 2).setValue(SCHEMA_VERSION);
  return spreadsheet;
}

function metadata_() {
  const spreadsheet = ensureWorkbook_();
  return { format: TRACE_FORMAT, syncVersion: SYNC_VERSION, schemaVersion: SCHEMA_VERSION,
    checkpoint: checkpoint_(spreadsheet), sheetName: spreadsheet.getName(), sheetId: spreadsheet.getId() };
}

function pullChanges_(after) {
  const spreadsheet = ensureWorkbook_();
  const records = [];
  Object.keys(ENTITY_FIELDS).forEach(function(type) {
    const sheet = ensureEntitySheet_(spreadsheet, type);
    const values = sheet.getDataRange().getValues();
    for (let row = 1; row < values.length; row += 1) {
      if (Number(values[row][2]) > after) records.push(rowToRecord_(type, values[row]));
    }
  });
  records.sort(function(a, b) { return a.remoteRevision - b.remoteRevision; });
  return { checkpoint: checkpoint_(spreadsheet), records: records };
}

function pushBatch_(request) {
  if (Number(request.syncVersion) !== SYNC_VERSION || Number(request.schemaVersion) !== SCHEMA_VERSION) throw new Error('The client sync format is incompatible.');
  if (!Array.isArray(request.records) || request.records.length > MAX_BATCH_SIZE) throw new Error('records must be an array of at most ' + MAX_BATCH_SIZE + ' items.');
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = ensureWorkbook_();
    let checkpoint = checkpoint_(spreadsheet);
    const accepted = [];
    const conflicts = [];
    request.records.forEach(function(input) {
      const record = validateRecord_(input);
      const sheet = ensureEntitySheet_(spreadsheet, record.entityType);
      const existing = findRecord_(sheet, record.id, record.entityType);
      if (existing && sameContent_(existing.record, record)) { accepted.push(existing.record); return; }
      if (existing && existing.record.remoteRevision > record.baseRemoteRevision) {
        conflicts.push({ local: record, remote: existing.record }); return;
      }
      checkpoint += 1;
      const stored = Object.assign({}, record, { remoteRevision: checkpoint });
      const targetRow = existing ? existing.row : sheet.getLastRow() + 1;
      sheet.getRange(targetRow, 1, 1, headers_(record.entityType).length).setValues([recordToRow_(stored)]);
      accepted.push(stored);
    });
    setCheckpoint_(spreadsheet, checkpoint);
    SpreadsheetApp.flush();
    return { checkpoint: checkpoint, accepted: accepted, conflicts: conflicts };
  } finally { lock.releaseLock(); }
}

function validateRecord_(record) {
  if (!record || record.format !== TRACE_FORMAT || Number(record.syncVersion) !== SYNC_VERSION || Number(record.schemaVersion) !== SCHEMA_VERSION) throw new Error('A record has an incompatible sync format.');
  if (!ENTITY_FIELDS[record.entityType]) throw new Error('A record has an unknown entity type.');
  if (typeof record.id !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(record.id)) throw new Error('A record has an invalid stable ID.');
  if (!Number.isInteger(record.revision) || record.revision < 1) throw new Error('A record has an invalid revision.');
  if (!validDate_(record.createdAt) || !validDate_(record.updatedAt) || (record.deletedAt !== null && !validDate_(record.deletedAt))) throw new Error('A record has invalid timestamps.');
  if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) throw new Error('A record has an invalid payload.');
  if (!Number.isInteger(record.baseRemoteRevision) || record.baseRemoteRevision < 0) throw new Error('A record has an invalid base revision.');
  ENTITY_FIELDS[record.entityType].forEach(function(field) { if (requiredField_(record.entityType, field) && !(field in record.payload)) throw new Error('A record is missing ' + field + '.'); });
  return record;
}

function requiredField_(type, field) {
  const optional = ['icon', 'colorRef', 'description', 'scaleMin', 'scaleMax', 'scaleStep', 'unit', 'section', 'weekdays', 'conditionalRule', 'routineId', 'eventDefinitionId', 'eventTimingKind', 'trendValue', 'customChoiceValue', 'sourceRoutineId', 'trackableId', 'trackableVersion', 'ownerTrackableVersion', 'required', 'quickLogTimingMode', 'reminder', 'dailyCheckInReminder', 'behavior'];
  return optional.indexOf(field) < 0;
}

function headers_(type) { return COMMON_HEADERS.concat(ENTITY_FIELDS[type]); }
function ensureEntitySheet_(spreadsheet, type) { return ensureSheet_(spreadsheet, TAB_NAMES[type], headers_(type)); }
function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, headers.length).setValues([headers]); sheet.setFrozenRows(1); }
  const actualWidth = Math.max(sheet.getLastColumn(), 1);
  const actual = sheet.getRange(1, 1, 1, actualWidth).getValues()[0].map(String);
  if (JSON.stringify(actual) === JSON.stringify(headers.slice(0, actual.length)) && actual.length < headers.length) {
    sheet.getRange(1, actual.length + 1, 1, headers.length - actual.length).setValues([headers.slice(actual.length)]);
  } else if (JSON.stringify(actual) !== JSON.stringify(headers)) throw new Error('The ' + name + ' tab has incompatible headers.');
  return sheet;
}

function recordToRow_(record) {
  const common = [record.id, record.revision, record.remoteRevision, record.createdAt, record.updatedAt, record.deletedAt || '', record.originDeviceId || ''];
  return common.concat(ENTITY_FIELDS[record.entityType].map(function(field) { return record.payload[field] === undefined ? '' : JSON.stringify(record.payload[field]); }));
}

function rowToRecord_(type, row) {
  const payload = {};
  ENTITY_FIELDS[type].forEach(function(field, index) { const value = row[COMMON_HEADERS.length + index]; if (value !== '') payload[field] = JSON.parse(String(value)); });
  if (type === 'trackables' && !payload.recordSemantics) {
    payload.recordSemantics = payload.behavior === 'quick_log' ? 'occurrence' : 'daily_value';
    payload.quickLogEnabled = payload.behavior === 'quick_log';
  }
  return { format: TRACE_FORMAT, syncVersion: SYNC_VERSION, schemaVersion: SCHEMA_VERSION, entityType: type,
    id: String(row[0]), revision: Number(row[1]), remoteRevision: Number(row[2]), createdAt: String(row[3]),
    updatedAt: String(row[4]), deletedAt: row[5] === '' ? null : String(row[5]),
    originDeviceId: row[6] === '' ? undefined : String(row[6]), baseRemoteRevision: Number(row[2]), payload: payload };
}

function findRecord_(sheet, id, type) {
  const values = sheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row += 1) if (String(values[row][0]) === id) return { row: row + 1, record: rowToRecord_(type, values[row]) };
  return null;
}

function sameContent_(a, b) {
  return a.entityType === b.entityType && a.id === b.id && a.revision === b.revision && a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt && a.deletedAt === b.deletedAt && (a.originDeviceId || '') === (b.originDeviceId || '') &&
    stableStringify_(a.payload) === stableStringify_(b.payload);
}
function stableStringify_(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify_).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stableStringify_(value[key]); }).join(',') + '}';
  return JSON.stringify(value);
}

function checkpoint_(spreadsheet) { const match = spreadsheet.getSheetByName(META_TAB).createTextFinder('checkpoint').matchEntireCell(true).findNext(); return match ? Number(match.offset(0, 1).getValue()) : 0; }
function setCheckpoint_(spreadsheet, value) { const match = spreadsheet.getSheetByName(META_TAB).createTextFinder('checkpoint').matchEntireCell(true).findNext(); if (!match) throw new Error('Trace metadata is incomplete.'); match.offset(0, 1).setValue(value); }
function nonnegativeInteger_(value, label) { const parsed = Number(value || 0); if (!Number.isInteger(parsed) || parsed < 0) throw new Error(label + ' must be a non-negative integer.'); return parsed; }
function validDate_(value) { return typeof value === 'string' && value !== '' && !isNaN(Date.parse(value)); }

// Historical M0.5 regression utility; not linked from consumer Settings.
const SPIKE_HEADERS = ['id', 'value', 'createdAt', 'receivedAt'];
function validateTestRecord_(record) { if (!record || typeof record.id !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(record.id) || typeof record.value !== 'string' || !validDate_(record.createdAt)) throw new Error('Invalid test record.'); return record; }
function writeTestRecord_(record) { const sheet = ensureSheet_(spreadsheet_(), 'SyncSpike', SPIKE_HEADERS); const existing = findTestRow_(sheet, record.id); sheet.getRange(existing || sheet.getLastRow() + 1, 1, 1, 4).setValues([[record.id, JSON.stringify(record.value), record.createdAt, new Date().toISOString()]]); }
function readTestRecord_(id) { const sheet = ensureSheet_(spreadsheet_(), 'SyncSpike', SPIKE_HEADERS); const row = findTestRow_(sheet, id); if (!row) return null; const values = sheet.getRange(row, 1, 1, 3).getValues()[0]; return { id: String(values[0]), value: JSON.parse(String(values[1])), createdAt: String(values[2]) }; }
function findTestRow_(sheet, id) { const values = sheet.getDataRange().getValues(); for (let row = 1; row < values.length; row += 1) if (String(values[row][0]) === id) return row + 1; return 0; }

function jsonSuccess_(data) { return jsonOutput_({ ok: true, data: data }); }
function jsonError_(error) { return jsonOutput_({ ok: false, error: error && error.message ? error.message : 'Unknown error.' }); }
function jsonOutput_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
