import { stopServer } from '../server.js';
export default async function globalTeardown() {
  stopServer();
}
