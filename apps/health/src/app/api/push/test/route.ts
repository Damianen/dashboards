import { jsonError } from "@/lib/api";
import { sendToAll } from "@/server/services/push";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  try {
    const result = await sendToAll({
      title: "Test notification",
      body: "Push is working 🎉",
      url: "/settings",
    });
    return Response.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
