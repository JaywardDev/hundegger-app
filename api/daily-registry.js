const MAX_ERROR_BODY_LENGTH = 1000;

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const rawBody = await new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (err) {
    throw new Error("Invalid JSON payload");
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res
        .status(405)
        .json({ error: "Method not allowed" });
    }

    const webAppUrl = process.env.DAILY_REGISTRY_WEB_APP_URL;
    if (!webAppUrl) {
      return res
        .status(500)
        .json({ error: "Missing DAILY_REGISTRY_WEB_APP_URL environment variable" });
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      console.error("daily-registry handler invalid JSON", err);
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    const apiToken = process.env.DAILY_REGISTRY_API_TOKEN;
    const outgoingPayload = apiToken
      ? { ...payload, apiToken }
      : payload;

    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(outgoingPayload),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      const truncatedBody = responseBody.length > MAX_ERROR_BODY_LENGTH
        ? `${responseBody.slice(0, MAX_ERROR_BODY_LENGTH)}…`
        : responseBody;

      return res.status(502).json({
        error: "Upstream request failed",
        status: response.status,
        body: truncatedBody,
      });
    }

    let result;
    try {
      result = await response.json();
    } catch (err) {
      console.error("daily-registry handler upstream JSON parse error", err);
      return res.status(502).json({ error: "Invalid JSON response from upstream" });
    }

    if (!result || result.ok !== true || typeof result.row !== "number") {
      return res.status(502).json({
        error: "Unexpected response shape from upstream",
        response: result,
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("daily-registry handler error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}