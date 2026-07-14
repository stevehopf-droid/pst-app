// _theiserverStore.js
// Shared helpers for queuing job data that TheIServer's poller will pick up.
//
// Redis schema:
//   theiserver-job:<jobId>  -> JSON string of the XML-ready job data (see send.js
//                              for the exact shape)
//   theiserver-index        -> JSON array of jobId strings currently queued

import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const INDEX_KEY = "theiserver-index";

function jobKey(jobId) {
  return `theiserver-job:${jobId}`;
}

export async function queueJob(jobId, data) {
  await redis.set(jobKey(jobId), data);

  const index = (await redis.get(INDEX_KEY)) || [];
  if (!index.includes(jobId)) {
    index.push(jobId);
    await redis.set(INDEX_KEY, index);
  }

  return data;
}

export async function getAllQueuedJobs() {
  const index = (await redis.get(INDEX_KEY)) || [];
  if (index.length === 0) return [];

  const records = await Promise.all(index.map((id) => redis.get(jobKey(id))));
  return records.filter(Boolean);
}

// Not currently called anywhere — kept here so Nick has a manual way to pull a
// job out of the feed later if TheIServer's polling turns out not to dedupe
// on its own, without needing another deploy to add this.
export async function removeQueuedJob(jobId) {
  await redis.del(jobKey(jobId));
  const index = (await redis.get(INDEX_KEY)) || [];
  await redis.set(INDEX_KEY, index.filter((id) => id !== jobId));
}
