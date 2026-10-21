import { writeFile } from "node:fs/promises";

const token = process.env.GITHUB_API_TOKEN;
const username = process.env.GITHUB_USERNAME || "ccclucky";
if (!token) {
  throw new Error("Missing GITHUB_API_TOKEN. Configure METRICS_TOKEN in GitHub Actions secrets.");
}

const now = new Date();
const thisYear = Number(
  new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Asia/Shanghai" }).format(now),
);
const lastSevenDays = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const yearStart = new Date(thisYear + "-01-01T00:00:00+08:00");

const query = `
  query($login: String!, $weekStart: DateTime!, $yearStart: DateTime!, $now: DateTime!) {
    user(login: $login) {
      week: contributionsCollection(from: $weekStart, to: $now) {
        totalCommitContributions
      }
      year: contributionsCollection(from: $yearStart, to: $now) {
        totalCommitContributions
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      weekStart: lastSevenDays.toISOString(),
      yearStart: yearStart.toISOString(),
      now: now.toISOString(),
    },
  }),
});
const payload = await response.json();
if (!response.ok || payload.errors?.length || !payload.data?.user) {
  throw new Error("Could not read GitHub contribution metrics: " + JSON.stringify({
    status: response.status,
    errors: payload.errors?.map((error) => error.message),
  }));
}

const week = payload.data.user.week.totalCommitContributions;
const year = payload.data.user.year.totalCommitContributions;
if (![week, year].every((n) => Number.isInteger(n) && n >= 0)) {
  throw new Error("Unexpected GitHub contribution metrics response");
}

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="171" viewBox="0 0 480 171" role="img" aria-label="GitHub commit activity: ' + week + ' commits in the last 7 days and ' + year + ' in ' + thisYear + '">',
  '<rect x="0.5" y="0.5" width="479" height="170" rx="12" fill="#ffffff" stroke="#d0d7de"/>',
  '<text x="24" y="31" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11" letter-spacing="1.1">COMMIT ACTIVITY</text>',
  '<line x1="240" y1="45" x2="240" y2="135" stroke="#d8dee4"/>',
  '<text x="24" y="63" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="13">Last 7 days</text>',
  '<text x="264" y="63" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="13">' + thisYear + ' year to date</text>',
  '<text x="24" y="112" fill="#24292f" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="46">' + week.toLocaleString("en-US") + '</text>',
  '<text x="264" y="112" fill="#24292f" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="46">' + year.toLocaleString("en-US") + '</text>',
  '<text x="24" y="148" fill="#6e7781" font-family="Arial, Helvetica, sans-serif" font-size="10">Contribution-eligible commits reported by GitHub</text>',
  '</svg>',
].join("\n");

await writeFile("github-commit-stats.svg", svg + "\n", "utf8");
console.log("Generated commit stats for " + username + ": last 7d=" + week + ", " + thisYear + " YTD=" + year);
