const baseUrl = process.env.PERSONA1_API_BASE_URL || "http://127.0.0.1:8787";

const response = await fetch(`${baseUrl}/v1/health`);
if (!response.ok) {
  throw new Error(`Health check failed with status ${response.status}.`);
}

const payload = await response.json();
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
