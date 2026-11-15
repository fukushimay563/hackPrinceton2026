import { rateLimit } from "@/lib/server/rateLimit";
import type { TutorContext } from "@/lib/tutor/context";
import { answerQuestion } from "@/lib/tutor/answer";

type Body = {
  question: string;
  context: TutorContext;
  history?: { role: "user" | "assistant"; content: string }[];
};

export async function POST(req: Request) {
  const limited = rateLimit(req, "tutor", 20, 60_000);
  if (limited) return limited;
  if (Number(req.headers.get("content-length") ?? 0) > 50_000) return Response.json({ error: "Request too large" }, { status: 413 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const question = (body.question ?? "").toString().slice(0, 1000).trim();
  if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });
  return Response.json(await answerQuestion({ question, context: body.context, history: body.history, bankingTools: true, channel: "web" }));
}
