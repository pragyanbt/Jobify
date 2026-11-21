// Application channels: the only ways Jobify may submit an application.
//
// Jobify does not scrape or bot-fill job sites. A channel must be an
// integration the user has authorized and the employer/platform permits
// (e.g. an official ATS partner API). Until one is registered, every
// application ends as "ready_manual": the user downloads the approved
// resume and submits it themselves.

export interface SubmitPayload {
  applicationId: string;
  jobUrl: string;
  pdf: Buffer;
  fileName: string;
}

export interface ApplicationChannel {
  id: string;
  label: string;
  /** True only for integrations that can submit without the user. */
  canAutoSubmit: boolean;
  submit(p: SubmitPayload): Promise<{ ok: true; reference?: string } | { ok: false; error: string }>;
}

const manual: ApplicationChannel = {
  id: "manual",
  label: "Manual submission",
  canAutoSubmit: false,
  async submit() {
    return { ok: false, error: "Manual channel: download the resume and apply on the employer's site." };
  },
};

const registry = new Map<string, ApplicationChannel>([[manual.id, manual]]);

/** Register an authorized integration (call at startup from its module). */
export function registerChannel(c: ApplicationChannel) {
  registry.set(c.id, c);
}

export function getChannel(id: string): ApplicationChannel {
  return registry.get(id) ?? manual;
}

export function listChannels(): ApplicationChannel[] {
  return [...registry.values()];
}
