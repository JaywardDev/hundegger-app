export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    return res.status(200).json({
      ok: true,
      message: "Serverless API route is working!",
    });
  } catch (err) {
    console.error("daily-registry handler error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}