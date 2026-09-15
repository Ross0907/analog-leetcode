import { handleAuthCallback } from "../../../lib/auth-actions.server";

export async function GET(request: Request) {
  return handleAuthCallback(request);
}
