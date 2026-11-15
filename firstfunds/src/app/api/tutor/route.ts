import { rateLimit } from "@/lib/server/rateLimit";
import type { TutorContext } from "@/lib/tutor/context";
import { answerQuestion } from "@/lib/tutor/answer";
import { resolveBankingUser } from "@/lib/banking/http";

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
  // Banking tools read the verified user's own records (or the demo profile when signed out).
  const who = await resolveBankingUser(req);
  if (who instanceof Response) return who;
  return Response.json(await answerQuestion({ question, context: body.context, history: body.history, bankingTools: true, channel: "web", bankUser: who.userId }));
}
