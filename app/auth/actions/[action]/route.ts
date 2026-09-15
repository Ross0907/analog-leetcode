import { handleAuthAction } from "../../../../lib/auth-actions.server";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  return handleAuthAction(request, action);
}
