import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    // Automatically reconnect with exponential backoff (max 10 s)
    reconnectStrategy: (retries) => Math.min(retries * 100, 10_000)
  }
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

redis.on("reconnecting", () => {
  console.warn("⚠️  Redis reconnecting…");
});

redis.on("ready", () => {
  console.log("✅ Redis connected");
});

// Connect once at module load. Other modules import the same
// singleton, so this only runs once per process. Start the
// connection but do not throw if Redis is unavailable in dev.
redis.connect().catch((err) => {
  console.warn("⚠️ Redis connection failed (continuing without cache):", err.message);
});

export default redis;
