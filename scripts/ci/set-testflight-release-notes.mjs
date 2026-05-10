import crypto from "node:crypto";
import fs from "node:fs";

const apiBase = "https://api.appstoreconnect.apple.com";
const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
const privateKey = fs.readFileSync(process.env.APP_STORE_CONNECT_KEY_PATH, "utf8");
const bundleId = process.env.APP_BUNDLE_ID;
const marketingVersion = process.env.MARKETING_VERSION;
const buildNumber = process.env.IOS_BUILD_NUMBER;
const locale = process.env.LOCALE;
const whatsNew = process.env.TESTFLIGHT_RELEASE_NOTES;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function createToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    aud: "appstoreconnect-v1",
    exp: now + 20 * 60,
    iat: now,
    iss: issuerId,
  };
  const body = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const signature = crypto.sign("sha256", Buffer.from(body), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${body}.${signature.toString("base64url")}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${createToken()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `App Store Connect API ${response.status} ${response.statusText}: ${text}`,
    );
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findBuild(appId) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const preReleaseVersions = await request(
      `/v1/preReleaseVersions?filter[app]=${appId}&filter[platform]=IOS&filter[version]=${encodeURIComponent(
        marketingVersion,
      )}&limit=1`,
    );
    const preReleaseVersion = preReleaseVersions.data?.[0];
    if (preReleaseVersion) {
      const builds = await request(
        `/v1/builds?filter[preReleaseVersion]=${preReleaseVersion.id}&filter[version]=${encodeURIComponent(
          buildNumber,
        )}&limit=1`,
      );
      const build = builds.data?.[0];
      if (build) {
        return build;
      }
    }

    console.log(
      `Waiting for TestFlight build ${marketingVersion} (${buildNumber}) to appear (${attempt}/30)...`,
    );
    await sleep(30_000);
  }
  throw new Error(
    `Could not find TestFlight build ${marketingVersion} (${buildNumber})`,
  );
}

const apps = await request(
  `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`,
);
const app = apps.data?.[0];
if (!app) {
  throw new Error(`Could not find app for bundle id ${bundleId}`);
}

const build = await findBuild(app.id);
const localizations = await request(
  `/v1/builds/${build.id}/betaBuildLocalizations?filter[locale]=${encodeURIComponent(
    locale,
  )}&limit=1`,
);
const localization = localizations.data?.[0];

if (localization) {
  await request(`/v1/betaBuildLocalizations/${localization.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        id: localization.id,
        type: "betaBuildLocalizations",
        attributes: { whatsNew },
      },
    }),
  });
} else {
  await request("/v1/betaBuildLocalizations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale, whatsNew },
        relationships: {
          build: {
            data: { id: build.id, type: "builds" },
          },
        },
      },
    }),
  });
}

console.log(`Set TestFlight release notes: ${whatsNew}`);
