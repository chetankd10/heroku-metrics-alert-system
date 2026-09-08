// Heroku log drains POST syslog (RFC 5424) frames using octet counting:
// "<byte-length> <syslog-message>" repeated back-to-back in one HTTP body.
// https://devcenter.heroku.com/articles/log-drains#https-drains

function splitFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset < buffer.length) {
    const spaceIdx = buffer.indexOf(0x20, offset); // ' '
    if (spaceIdx === -1) break;

    const length = parseInt(buffer.slice(offset, spaceIdx).toString('utf8'), 10);
    if (Number.isNaN(length) || length < 0) break;

    const start = spaceIdx + 1;
    const end = start + length;
    if (end > buffer.length) break;

    frames.push(buffer.slice(start, end).toString('utf8'));
    offset = end;
  }

  return frames;
}

// <PRI>VERSION TIMESTAMP HOSTNAME APPNAME PROCID MSGID STRUCTURED-DATA MESSAGE
const SYSLOG_PATTERN = /^<(\d+)>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*)$/;

function parseSyslogMessage(raw) {
  const match = raw.match(SYSLOG_PATTERN);
  if (!match) {
    return { hostname: null, appName: null, procId: null, message: raw };
  }
  const [, , , timestamp, hostname, appName, procId, , , message] = match;
  return { timestamp, hostname, appName, procId, message };
}

function parseLogDrainBody(buffer) {
  return splitFrames(buffer).map(parseSyslogMessage);
}

module.exports = { splitFrames, parseSyslogMessage, parseLogDrainBody };
