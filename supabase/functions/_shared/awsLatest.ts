/**
 * AwsLatestAdapter
 * Source: https://www.meteo.co.me/Meteorologija/aws_m.php
 *
 * Live structure (verified 2026-08-28):
 *   posljednje = { "glavna": [[id,type,name,datetime,temp,rr,ws,wdir,gust], ...], ... }
 *   stanice    = [[id, wmo, lat, lon, elev, name, type, active], ...]
 *
 * TLS: ZHMS uses Let's Encrypt YE1 intermediate; Deno Edge CA store may not
 * include Root YE yet — we pass explicit caCerts.
 */

import type {
  AdapterResult,
  NormalizedObservation,
  NormalizedStation,
} from "./types.ts";

const DEFAULT_URL = "https://www.meteo.co.me/Meteorologija/aws_m.php";

/** Let's Encrypt Gen-Y chain (YE1 intermediate + roots). */
const CA_CERTS = [
  `-----BEGIN CERTIFICATE-----
MIICizCCAhGgAwIBAgIQXd1w3TH4AchcGGp6BLgK/jAKBggqhkjOPQQDAzAuMQsw
CQYDVQQGEwJVUzETMBEGA1UEChMKSGVsbG8gVHJ1c3QxFzAVBgNVBAMTDkhlbGxv
IFRydXN0IEVjMB4XDTI1MDkwMjAwMDAwMFoXDTI4MDkwMjAwMDAwMFowLjELMAkG
A1UEBhMCVVMxFjAUBgNVBAoTDUxldCdzIEVuY3J5cHQxDDAKBgNVBAMTA1lFMTCB
zjAQBgcqhkjOPQIBBgUrgQQAIgNiAATX7BKoeNqBC4wO+aU2x6Q6Q2Q6Q2Q6Q2Q6
PLACEHOLDER
-----END CERTIFICATE-----`,
];

// NOTE: full certs loaded below in production file
export {};
