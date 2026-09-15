import { challengeAuthoringStarterTemplate } from "../../../lib/challenge-authoring";

export function GET() {
  return new Response(`${JSON.stringify(challengeAuthoringStarterTemplate, null, 2)}\n`, {
    status: 200,
    headers: {
      "cache-control": "public, max-age=3600",
      "content-disposition": "attachment; filename=anacode-challenge-template.v1.json",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
