export type Observation = {
  measuredAt: string | null;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  windDirectionCode: number | null;
  windGustMs: number | null;
  pressureHpa: number | null;
  solarRadiationWm2: number | null;
  sourceStatus?: string;
};

export type Station = {
  id: string;
  name: string;
  type: string;
  location: {
    lat: number | null;
    lng: number | null;
    elevationM: number | null;
  };
  observation: Observation | null;
};
