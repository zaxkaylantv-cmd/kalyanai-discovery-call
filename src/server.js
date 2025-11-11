const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');

const app = express();
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
