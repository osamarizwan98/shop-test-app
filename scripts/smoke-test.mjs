const baseUrl = process.env.SMOKE_BASE_URL;

if (!baseUrl) {
  console.error("SMOKE_BASE_URL is required. Example: https://your-app-domain.com");
  process.exit(1);
}

const targets = [
  "/",
  "/auth/login",
  "/app",
];

async function run() {
  const failures = [];

  for (const path of targets) {
    const url = new URL(path, baseUrl).toString();
    try {
      const response = await fetch(url, { redirect: "manual" });
      const okStatus =
        (response.status >= 200 && response.status < 400) ||
        response.status === 401;

      const line = `${response.status} ${path}`;
      if (!okStatus) {
        failures.push(line);
        console.error(`[SMOKE FAIL] ${line}`);
      } else {
        console.log(`[SMOKE OK] ${line}`);
      }
    } catch (error) {
      failures.push(`ERR ${path}`);
      console.error(`[SMOKE ERR] ${path}`, error);
    }
  }

  if (failures.length > 0) {
    console.error(`Smoke test failed with ${failures.length} issue(s).`);
    process.exit(1);
  }

  console.log("Smoke test passed.");
}

run();
