const test = require("node:test");
const assert = require("node:assert/strict");

const {
  API_URL,
  FETCH_TIMEOUT_MS,
  buildRequestUrl,
  mapPredictionToTip,
  fetchPredictions
} = require("../src/jobs/sync-tips.js");

function withEnv(env, callback) {
  const previous = {
    FOOTBALL_MARKET: process.env.FOOTBALL_MARKET,
    FOOTBALL_FEDERATION: process.env.FOOTBALL_FEDERATION,
    FOOTBALL_ISO_DATE: process.env.FOOTBALL_ISO_DATE,
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
    RAPIDAPI_HOST: process.env.RAPIDAPI_HOST
  };

  Object.assign(process.env, env);

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("buildRequestUrl uses classic market by default", async () => {
  await withEnv(
    {
      FOOTBALL_MARKET: "",
      FOOTBALL_FEDERATION: "",
      FOOTBALL_ISO_DATE: ""
    },
    () => {
      assert.equal(buildRequestUrl(), `${API_URL}?market=classic`);
    }
  );
});

test("buildRequestUrl includes optional federation and iso_date filters", async () => {
  await withEnv(
    {
      FOOTBALL_MARKET: "classic",
      FOOTBALL_FEDERATION: "UEFA",
      FOOTBALL_ISO_DATE: "2026-05-10"
    },
    () => {
      assert.equal(
        buildRequestUrl(),
        `${API_URL}?market=classic&federation=UEFA&iso_date=2026-05-10`
      );
    }
  );
});

test("mapPredictionToTip flattens odds and preserves raw payload", () => {
  const item = {
    id: 123,
    start_date: "2026-05-10T12:00:00Z",
    federation: "UEFA",
    competition_name: "Premier League",
    competition_cluster: "England",
    season: "2025 - 2026",
    home_team: "Team A",
    away_team: "Team B",
    market: "classic",
    prediction: "1X",
    status: "pending",
    is_expired: false,
    result: "",
    last_update_at: "2026-05-10T10:00:00Z",
    odds: {
      1: 1.55,
      X: 3.5,
      2: 5.2,
      "1X": 1.12,
      X2: 2.1,
      12: 1.35
    }
  };

  const mapped = mapPredictionToTip(item);

  assert.equal(mapped.fixture_id, 123);
  assert.equal(mapped.odds_1, 1.55);
  assert.equal(mapped.odds_x, 3.5);
  assert.equal(mapped.odds_2, 5.2);
  assert.equal(mapped.odds_1x, 1.12);
  assert.equal(mapped.odds_x2, 2.1);
  assert.equal(mapped.odds_12, 1.35);
  assert.equal(mapped.result, null);
  assert.equal(mapped.raw_payload, item);
  assert.ok(mapped.updated_at);
});

test("fetchPredictions returns parsed body on success", async () => {
  const originalFetch = global.fetch;

  await withEnv(
    {
      RAPIDAPI_KEY: "test-key",
      RAPIDAPI_HOST: "football-prediction-api.p.rapidapi.com"
    },
    async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: 1 }] })
      });

      const result = await fetchPredictions("https://example.com");
      assert.deepEqual(result.body, { data: [{ id: 1 }] });
      assert.equal(result.httpStatus, 200);
    }
  );

  global.fetch = originalFetch;
});

test("fetchPredictions raises a clear timeout error", async () => {
  const originalFetch = global.fetch;

  await withEnv(
    {
      RAPIDAPI_KEY: "test-key",
      RAPIDAPI_HOST: "football-prediction-api.p.rapidapi.com"
    },
    async () => {
      global.fetch = async (_url, options) => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";

        if (!options.signal) {
          throw new Error("Expected AbortController signal");
        }

        throw error;
      };

      await assert.rejects(
        () => fetchPredictions("https://example.com"),
        new Error(
          `RapidAPI request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds`
        )
      );
    }
  );

  global.fetch = originalFetch;
});
