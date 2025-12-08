import { startServer } from '../server.js';
import config from '../server/parseconfig.js';
const port = config.port || 3000;

export default async function globalSetup() {
  global.__SERVER__ = startServer(port);
}
