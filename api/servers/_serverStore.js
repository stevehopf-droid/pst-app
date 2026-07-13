import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const INDEX_KEY = "server:index";

function serverKey(theiserverId) {
  return `server:${theiserverId}`;
}

export async function getAllServers() {
  const index = (await redis.get(INDEX_KEY)) || [];
  if (index.length === 0) return [];

  const records = await Promise.all(
    index.map((id) => redis.get(serverKey(id)))
  );

  return records.filter(Boolean);
}

export async function addServer({ name, license, theiserverId, pstServerSerialNumber }) {
  if (!name || !license || !theiserverId) {
    throw new Error("name, license, and theiserverId are all required");
  }

  const key = serverKey(theiserverId);
  const existing = await redis.get(key);
  if (existing) {
    throw new Error(`A server with ID ${theiserverId} already exists`);
  }

  const record = {
    name,
    license,
    theiserverId: String(theiserverId),
    ...(pstServerSerialNumber !== undefined ? { pstServerSerialNumber } : {}),
  };
  await redis.set(key, record);

  const index = (await redis.get(INDEX_KEY)) || [];
  index.push(String(theiserverId));
  await redis.set(INDEX_KEY, index);

  return record;
}

export async function removeServer(theiserverId) {
  const key = serverKey(theiserverId);
  const existing = await redis.get(key);
  if (!existing) {
    throw new Error(`No server found with ID ${theiserverId}`);
  }

  await redis.del(key);

  const index = (await redis.get(INDEX_KEY)) || [];
  const updatedIndex = index.filter((id) => id !== String(theiserverId));
  await redis.set(INDEX_KEY, updatedIndex);

  return { removed: true, theiserverId: String(theiserverId) };
}

export async function updateServer(theiserverId, { name, license, pstServerSerialNumber }) {
  const key = serverKey(theiserverId);
  const existing = await redis.get(key);
  if (!existing) {
    throw new Error(`No server found with ID ${theiserverId}`);
  }

  const updated = {
    ...existing,
    ...(name ? { name } : {}),
    ...(license ? { license } : {}),
    ...(pstServerSerialNumber !== undefined ? { pstServerSerialNumber } : {}),
  };
  await redis.set(key, updated);

  return updated;
}
