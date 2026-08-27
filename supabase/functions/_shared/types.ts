/** Canonical internal types — frontend/API never see ZHMS names. */

export type NormalizedStation = {
  stationId: string;
  wmoId: number | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  stationType: string;
  active: boolean;
};

export type NormalizedObservation = {
  stationId: string;
  measuredAt: string; // ISO 8601 UTC
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  windDirectionCode: number | null;
  windGustMs: number | null;
};

export type AdapterResult = {
  stations: NormalizedStation[];
  observations: NormalizedObservation[];
  sourceHash: string;
  fetchedAt: string; // ISO 8601 UTC
};

export type SyncStatusUpdate = {
  sourceKey: string;
  status: "ok" | "error" | "running";
  lastAttemptAt: string;
  lastSuccessAt?: string;
  lastSourceHash?: string;
  lastError?: string | null;
  rowsWritten?: number;
};
