export const runtime = "nodejs";

// The browser needs the VAPID public key (as the applicationServerKey) before it
// can call pushManager.subscribe(). It's public by design.
export function GET(): Response {
  return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}
