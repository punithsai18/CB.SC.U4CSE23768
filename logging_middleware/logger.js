const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, 'app.log');

function log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}\n`;
    
    // In-built console.log is prohibited by prompt instructions, writing to file instead.
    fs.appendFileSync(logFilePath, logEntry);
}

module.exports = {
    info: (msg, meta) => log('info', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta)
};
