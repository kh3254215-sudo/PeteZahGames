import { registerSW } from './register-sw.js';
import { __uvConfig } from './uv/config.js';

('use strict');
let destination = '';

try {
  destination = new URL(location.hash.slice(1));

  if (destination.hostname.includes('youtube.com') || destination.hostname.includes('google')) {
    __uvConfig.bare = '/api/bare-premium/bare/';
    self.__uvConfig = __uvConfig;
  }

  if (!destination.protocol) {
    destination = new URL('https://' + destination.href);
  }
} catch (err) {
  alert(`Bad # string or bad URL. Got error:\n${err}`);
  throw err;
}

registerSW()
  .then(() => {
    window.open(__uvConfig.prefix + __uvConfig.encodeUrl(destination), '_self');
  })
  .catch((err) => {
    alert(`Encountered error:\n${err}`);
  });
