require('dotenv').config({ override: true });
const logger = require('./logger');
const app = require('./server');

const port = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    logger.info({ port }, 'Server listening');
  });
}
