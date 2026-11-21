// The browser build always runs RO_STORE=pglite, so server/src/redis.ts uses its MemoryRedis and never constructs this.
export class Redis { constructor() { throw new Error("ioredis is not available in the browser build"); } }
export default Redis;
