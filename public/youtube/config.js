
// This file overwrites the stock UV config.js

self.__uv$config = {
  prefix: "/youtube/youtube/",
  bare: "https://youtube-bypass.davidandasabi.org/bare/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/youtube/handler.js",
  client: "/youtube/client.js",
  bundle: "/youtube/bundle.js",
  config: "/youtube/config.js",
  sw: "/youtube/rizz.sw.js",
};
