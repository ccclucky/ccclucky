import { writeFile } from "node:fs/promises";

const token = process.env.GITHUB_API_TOKEN;
const username = process.env.GITHUB_USERNAME || "ccclucky";
if (!token) throw new Error("Missing GITHUB_API_TOKEN");

const today = new Date();
const year = Number(new Intl.DateTimeFormat("en-US", {
  year: "numeric", timeZone: "Asia/Shanghai",
}).format(today));
const yearStart = new Date(year + "-01-01T00:00:00+08:00");
const weekStart = new Date(today.getTime() - 7 * 86400000);

const query = `query($login: String!, $weekStart: DateTime!, $yearStart: DateTime!, $now: DateTime!) {
  user(login: $login) {
    week: contributionsCollection(from: $weekStart, to: $now) {
      totalCommitContributions
    }
    year: contributionsCollection(from: $yearStart, to: $now) {
      totalCommitContributions
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
            weekday
          }
        }
      }
    }
  }
}`;

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
      weekStart: weekStart.toISOString(),
      yearStart: yearStart.toISOString(),
      now: today.toISOString(),
    },
  }),
});
const result = await response.json();
if (!response.ok || result.errors?.length || !result.data?.user) {
  throw new Error("GitHub GraphQL returned an error: " + JSON.stringify({
    status: response.status,
    errors: result.errors?.map((e) => e.message),
  }));
}

const stats = result.data.user;
const week = stats.week.totalCommitContributions;
const yearTotal = stats.year.totalCommitContributions;
const weeks = stats.year.contributionCalendar.weeks;
if (![week, yearTotal].every((n) => Number.isInteger(n) && n >= 0) ||
    !Array.isArray(weeks) || weeks.length === 0) {
  throw new Error("Invalid commit counts or contribution calendar");
}

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]
));
const num = (value) => value.toLocaleString("en-US");
const header = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="860" height="252" viewBox="0 0 860 252" role="img" aria-label="GitHub contribution activity for ' + esc(username) + '">',
  '<rect x="0.5" y="0.5" width="859" height="251" rx="12" fill="#ffffff" stroke="#d0d7de"/>',
  '<text x="24" y="29" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" letter-spacing="1.2">GITHUB / CONTRIBUTION ACTIVITY</text>',
  '<text x="24" y="87" fill="#24292f" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700">' + num(week) + '</text>',
  '<text x="24" y="105" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="11">COMMITS · LAST 7 DAYS</text>',
  '<line x1="260" y1="43" x2="260" y2="109" stroke="#d8dee4"/>',
  '<text x="286" y="87" fill="#24292f" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700">' + num(yearTotal) + '</text>',
  '<text x="286" y="105" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="11">' + year + ' COMMITS · YEAR TO DATE</text>',
  '<line x1="24" y1="120" x2="836" y2="120" stroke="#eaeef2"/>',
];
const square = 10;
const step = 12;
const left = 24;
const top = 144;
const colors = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
const activityColor = (count) => count === 0 ? colors[0] :
  count < 3 ? colors[1] : count < 6 ? colors[2] : count < 12 ? colors[3] : colors[4];

const boxes = [];
const labels = [];
const usedMonths = new Set();
for (let w = 0; w < weeks.length; w++) {
  const days = weeks[w].contributionDays;
  for (const day of days) {
    const dayOfWeek = day.weekday;
    if (dayOfWeek < 0 || dayOfWeek > 6) continue;
    const x = left + w * step;
    const y = top + dayOfWeek * step;
    const date = day.date;
    const monthKey = date.slice(0, 7);
    if (date.endsWith("-01") && !usedMonths.has(monthKey)) {
      usedMonths.add(monthKey);
      const month = new Date(date + "T12:00:00Z")
        .toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
      labels.push('<text x="' + x + '" y="138" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="10">' + month + '</text>');
    }
    boxes.push('<rect x="' + x + '" y="' + y + '" width="' + square + '" height="' + square +
      '" rx="2" fill="' + activityColor(day.contributionCount) + '"><title>' +
      esc(date + ": " + day.contributionCount + " contributions") + '</title></rect>');
  }
}
const bottom = [
  '<text x="24" y="244" fill="#6e7781" font-family="Arial, Helvetica, sans-serif" font-size="10">Year-to-date contribution calendar · daily activity includes commits and other eligible contributions</text>',
  '<text x="754" y="155" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="10">Less</text>',
  ...colors.map((color, i) => '<rect x="' + (754 + i * 14) + '" y="165" width="10" height="10" rx="2" fill="' + color + '"/>'),
  '<text x="754" y="191" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="10">More →</text>',
  '</svg>',
];

const overview = [...header, ...labels, ...boxes, ...bottom].join("\n") + "\n";
await writeFile("github-activity-overview.svg", overview, "utf8");

// Retain the legacy commit-only card for external references.
const compact = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="171" viewBox="0 0 480 171" role="img" aria-label="GitHub commits in the last seven days and this year">',
  '<rect x="0.5" y="0.5" width="479" height="170" rx="12" fill="#ffffff" stroke="#d0d7de"/>',
  '<text x="24" y="31" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11" letter-spacing="1.1">COMMIT ACTIVITY</text>',
  '<line x1="240" y1="45" x2="240" y2="135" stroke="#d8dee4"/>',
  '<text x="24" y="63" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="13">Last 7 days</text>',
  '<text x="264" y="63" fill="#57606a" font-family="Arial, Helvetica, sans-serif" font-size="13">' + year + ' year to date</text>',
  '<text x="24" y="112" fill="#24292f" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="46">' + num(week) + '</text>',
  '<text x="264" y="112" fill="#24292f" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="46">' + num(yearTotal) + '</text>',
  '<text x="24" y="148" fill="#6e7781" font-family="Arial, Helvetica, sans-serif" font-size="10">Contribution-eligible commits reported by GitHub</text>',
  '</svg>',
].join("\n") + "\n";
await writeFile("github-commit-stats.svg", compact, "utf8");

console.log("Updated 7-day/year-to-date commits and contribution overview for " + username);
