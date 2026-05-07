require("dotenv").config();

const WebSocket = require("ws");
const { createClient } = require("@supabase/supabase-js");

const API_URL = "https://football-prediction-api.p.rapidapi.com/api/v2/predictions";
const UPSERT_BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 30000;

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildRequestUrl() {
  const searchParams = new URLSearchParams();
  searchParams.set("market", process.env.FOOTBALL_MARKET || "classic");

  if (process.env.FOOTBALL_FEDERATION) {
    searchParams.set("federation", process.env.FOOTBALL_FEDERATION);
  }

  if (process.env.FOOTBALL_ISO_DATE) {
    searchParams.set("iso_date", process.env.FOOTBALL_ISO_DATE);
  }

  return `${API_URL}?${searchParams.toString()}`;
}

function createSupabase() {
  // Supabase's realtime client expects a WebSocket implementation on Node < 22.
  if (!globalThis.WebSocket) {
    globalThis.WebSocket = WebSocket;
  }

  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

function mapPredictionToTip(item) {
  const odds = item.odds || {};

  return {
    fixture_id: item.id,
    start_date: item.start_date,
    federation: item.federation,
    competition_name: item.competition_name,
    competition_cluster: item.competition_cluster,
    season: item.season || null,
    home_team: item.home_team,
    away_team: item.away_team,
    market: item.market,
    prediction: item.prediction,
    status: item.status,
    is_expired: Boolean(item.is_expired),
    result: item.result || null,
    last_update_at: item.last_update_at || null,
    odds_1: odds["1"] ?? null,
    odds_x: odds["X"] ?? null,
    odds_2: odds["2"] ?? null,
    odds_1x: odds["1X"] ?? null,
    odds_x2: odds["X2"] ?? null,
    odds_12: odds["12"] ?? null,
    raw_payload: item,
    updated_at: new Date().toISOString()
  };
}

async function insertSyncLog(supabase, payload) {
  const { error } = await supabase.from("sync_logs").insert(payload);

  if (error) {
    console.error("Failed to write sync log:", error.message);
  }
}

async function upsertTips(supabase, rows) {
  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const { error } = await supabase.from("tips").upsert(batch, {
      onConflict: "fixture_id"
    });

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }
  }
}

async function fetchPredictions(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "x-rapidapi-key": requireEnv("RAPIDAPI_KEY"),
        "x-rapidapi-host": process.env.RAPIDAPI_HOST || "football-prediction-api.p.rapidapi.com",
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `RapidAPI request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  let parsedBody = null;

  try {
    parsedBody = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    throw new Error(`API returned invalid JSON: ${error.message}`);
  }

  if (!response.ok) {
    const message = parsedBody?.message || response.statusText || "Unknown API error";
    const error = new Error(`RapidAPI request failed with ${response.status}: ${message}`);
    error.httpStatus = response.status;
    error.rawResponse = parsedBody || responseText;
    throw error;
  }

  if (!parsedBody || !Array.isArray(parsedBody.data)) {
    const error = new Error("API response does not contain a valid data array");
    error.httpStatus = response.status;
    error.rawResponse = parsedBody;
    throw error;
  }

  return {
    body: parsedBody,
    httpStatus: response.status
  };
}

async function main() {
  const requestedAt = new Date().toISOString();
  let endpoint = API_URL;
  let supabase = null;

  try {
    endpoint = buildRequestUrl();
    supabase = createSupabase();

    const { body, httpStatus } = await fetchPredictions(endpoint);
    const rows = body.data.map(mapPredictionToTip);

    if (rows.length > 0) {
      await upsertTips(supabase, rows);
    }

    await insertSyncLog(supabase, {
      endpoint,
      requested_at: requestedAt,
      http_status: httpStatus,
      records_count: rows.length,
      raw_response: body
    });

    console.log(
      `Sync finished successfully. Upserted ${rows.length} tip(s) from ${endpoint}.`
    );
  } catch (error) {
    if (supabase) {
      await insertSyncLog(supabase, {
        endpoint,
        requested_at: requestedAt,
        http_status: error.httpStatus || null,
        records_count: 0,
        error_message: error.message,
        raw_response: error.rawResponse || null
      });
    } else {
      console.error(
        "Sync log skipped because Supabase client was not initialized:",
        error.message
      );
    }

    console.error("Sync failed:", error.message);
    process.exitCode = 1;
  }
}

main();
