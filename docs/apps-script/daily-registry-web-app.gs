/**
 * Web App entry point for logging Operations entries into the Daily_Registry sheet.
 *
 * Replace SHEET_ID with the spreadsheet ID that owns the "Daily_Registry" tab.
 * Set the ALLOWED_ORIGIN constant to the exact origin of the React app that will
 * submit entries (for example, https://operations.example.com).
 *
 * Deploy this script as a Web App (Execute as "Me", access for "Anyone with the link")
 * and store the shared token in Script Properties under the key `API_TOKEN`.
 */
const CONFIG = {
  SHEET_ID: '1WxxhatxzcHd6_pAvBgc5Mw70-0qQVS3LXVZYbyPT-_c',
  SHEET_NAME: 'Daily_Registry',
  ALLOWED_ORIGIN: 'http://192.168.150.100:4000',
  AUTH_HEADER: 'X-API-Token',
};

/**
 * Handles POST requests coming from the React client.
 * Responds with CORS headers for OPTIONS preflight requests as well.
 */
function doPost(e) {
  if (!e || typeof e !== 'object') {
    return createErrorResponse(
      400,
      'Request payload is required.',
      'missing_request'
    );
  }

  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'REPLACE_WITH_SHEET_ID') {
    return createErrorResponse(
      500,
      'SHEET_ID is not configured in the Apps Script file.',
      'missing_sheet_id'
    );
  }

  const parsed = parseJsonBody(e);
  if (parsed.error) {
    return createErrorResponse(400, parsed.error, 'invalid_json');
  }

  const payload = parsed.data;
  const token = readToken(e, payload);

  if (!token) {
    return createErrorResponse(401, 'Missing API token.', 'missing_token');
  }

  const storedToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!storedToken) {
    return createErrorResponse(
      500,
      'API_TOKEN script property is not configured.',
      'missing_api_token_property'
    );
  }

  if (token !== storedToken) {
    return createErrorResponse(401, 'Invalid API token.', 'invalid_token');
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return createErrorResponse(400, validationError.message, 'validation_error', {
      fields: validationError.fields,
    });
  }

  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      return createErrorResponse(
        500,
        'Daily_Registry sheet tab was not found.',
        'sheet_not_found'
      );
    }

    const nextRow = sheet.getLastRow() + 1;

    const updates = [
      { column: 1, value: parseDateValue(payload.date) },
      { column: 3, value: payload.operator },
      { column: 4, value: payload.startTime },
      { column: 5, value: payload.finishTime },
      { column: 7, value: payload.projectFile },
      { column: 10, value: payload.timeRemainStart },
      { column: 11, value: payload.timeRemainEnd },
      { column: 16, value: payload.downtimeHrs },
      { column: 17, value: payload.downtimeReason },
      { column: 18, value: payload.interruptionHrs },
      { column: 19, value: payload.interruptionReason },
    ];

    updates.forEach(function (entry) {
      const cleanedValue = entry.value === undefined || entry.value === null ? '' : entry.value;
      sheet.getRange(nextRow, entry.column).setValue(cleanedValue);
    });

    return createSuccessResponse({ ok: true, row: nextRow });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return createErrorResponse(500, message, 'server_error');
  }
}

function parseJsonBody(e) {
  try {
    const text = e.postData.contents;
    if (!text) {
      return { data: null, error: 'Empty request body.' };
    }
    return { data: JSON.parse(text) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to parse JSON payload.';
    return { data: null, error: message };
  }
}

function readToken(e, payload) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.token === 'string') {
      return payload.token;
    }
    if (typeof payload.apiToken === 'string') {
      return payload.apiToken;
    }
  }

  return null;
}

function validatePayload(payload) {
  var requiredFields = [
    'date',
    'operator',
    'startTime',
    'finishTime',
    'projectFile',
    'timeRemainStart',
    'timeRemainEnd',
  ];

  var missing = [];
  requiredFields.forEach(function (field) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      missing.push(field);
    }
  });

  if (missing.length > 0) {
    return {
      message: 'Missing required fields: ' + missing.join(', '),
      fields: missing,
    };
  }

  try {
    parseDateValue(payload.date);
  } catch (err) {
    return {
      message: 'Invalid date. Expecting format YYYY-MM-DD.',
      fields: ['date'],
    };
  }

  return null;
}

function parseDateValue(dateString) {
  if (!dateString) {
    throw new Error('Date is required.');
  }
  var timezone = Session.getScriptTimeZone();
  var parsed = Utilities.parseDate(dateString, timezone, 'yyyy-MM-dd');
  if (!parsed) {
    throw new Error('Unable to parse date. Use YYYY-MM-DD.');
  }
  return parsed;
}

function createSuccessResponse(body) {
  return createJsonResponse(200, body);
}

function createErrorResponse(status, message, code, details) {
  var body = {
    ok: false,
    error: {
      message: message,
      code: code || 'error',
    },
  };

  if (details) {
    body.error.details = details;
  }

  return createJsonResponse(status, body);
}

function createJsonResponse(_status, body) {
  var output = ContentService.createTextOutput(JSON.stringify(body));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function doGet() {
  return createSuccessResponse({ ok: true, method: 'GET' });
}
