import fs from "node:fs";

const maxNotesLength = 3900;

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function compact(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function stripMarkdown(value) {
  return compact(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

function bodyHighlights(body) {
  const cleaned = stripMarkdown(body);
  if (!cleaned) {
    return [];
  }

  return cleaned
    .split("\n")
    .map((line) => compact(line))
    .filter(Boolean)
    .filter((line) => !/^[-=]{3,}$/.test(line))
    .filter((line) => !/^(summary|概要|changes?|変更|checklist|確認|tests?)[:：]?$/i.test(line))
    .slice(0, 4);
}

function eventMetadata(eventName, event) {
  if (eventName === "pull_request") {
    const pull = event.pull_request;
    const title = compact(pull?.title);
    const highlights = bodyHighlights(pull?.body);
    return {
      source: `PR #${pull?.number || ""}`.trim(),
      title,
      highlights,
    };
  }

  const commitMessage = event.head_commit?.message || "";
  const lines = commitMessage
    .split("\n")
    .map((line) => compact(line))
    .filter(Boolean);
  const mergeLine = lines.find((line) => /^Merge pull request #\d+/.test(line));
  const prNumber = mergeLine?.match(/#(\d+)/)?.[1];
  const title = lines.find((line) => !/^Merge pull request #\d+/.test(line)) || lines[0];

  return {
    source: prNumber ? `PR #${prNumber}` : "main",
    title: compact(title),
    highlights: [],
  };
}

function buildNotes(metadata) {
  const title = metadata.title || "Tachyon Cowork update";
  const header = metadata.source ? `${metadata.source}: ${title}` : title;
  const lines = [header];

  for (const highlight of metadata.highlights) {
    if (highlight !== title) {
      lines.push(`- ${highlight}`);
    }
  }

  const buildLine = [
    process.env.MARKETING_VERSION && `v${process.env.MARKETING_VERSION}`,
    process.env.IOS_BUILD_NUMBER && `build ${process.env.IOS_BUILD_NUMBER}`,
    process.env.SHORT_SHA && `commit ${process.env.SHORT_SHA}`,
  ]
    .filter(Boolean)
    .join(" / ");

  if (buildLine) {
    lines.push("", buildLine);
  }

  const notes = lines.join("\n").slice(0, maxNotesLength).trim();
  return notes || "Tachyon Cowork update";
}

function appendEnv(name, value) {
  if (!process.env.GITHUB_ENV) {
    return;
  }
  fs.appendFileSync(process.env.GITHUB_ENV, `${name}<<__${name}__\n${value}\n__${name}__\n`);
}

const event = process.env.GITHUB_EVENT_PATH
  ? readJson(process.env.GITHUB_EVENT_PATH)
  : {};
const metadata = eventMetadata(process.env.GITHUB_EVENT_NAME, event);
const releaseNotes = buildNotes(metadata);

appendEnv("TESTFLIGHT_RELEASE_NOTES", releaseNotes);
console.log(`Generated TestFlight release notes:\n${releaseNotes}`);

if (process.env.TESTFLIGHT_RELEASE_METADATA_PATH) {
  fs.writeFileSync(
    process.env.TESTFLIGHT_RELEASE_METADATA_PATH,
    `${JSON.stringify(
      {
        bundleId: process.env.APP_BUNDLE_ID,
        locale: process.env.LOCALE,
        marketingVersion: process.env.MARKETING_VERSION,
        buildNumber: process.env.IOS_BUILD_NUMBER,
        releaseNotes,
        source: metadata.source,
        headSha: process.env.GITHUB_SHA,
      },
      null,
      2,
    )}\n`,
  );
}
