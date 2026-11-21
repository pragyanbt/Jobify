import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { createMaster } from "@/lib/masters";
import { importResumeFile, MAX_UPLOAD_BYTES } from "@/lib/resumeImport";

/** Upload a resume file: .pdf, .docx, .tex, .txt or .md (multipart field "file"). */
export const POST = authed(async (req, user) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Attach a resume file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("The file is larger than 10 MB.");

  const name = String(form.get("name") ?? "").trim() || file.name.replace(/\.[^.]+$/, "") || "Master resume";
  const result = await importResumeFile(Buffer.from(await file.arrayBuffer()), file.name);
  const m = await createMaster(user.id, name.slice(0, 120), result);
  return NextResponse.json(m, { status: 201 });
});
