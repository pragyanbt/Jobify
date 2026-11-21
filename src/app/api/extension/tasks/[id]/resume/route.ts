import { handler, NotFoundError } from "@/lib/api";
import { taskResume } from "@/lib/autoSubmit";
import { requireExtensionUser } from "@/lib/extensionAuth";

/** The tailored resume PDF to attach for a claimed application. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireExtensionUser(req);
  const pdf = await taskResume(user.id, (await params).id);
  if (!pdf) throw new NotFoundError("No resume PDF for this application.");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
});
