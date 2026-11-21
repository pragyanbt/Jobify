// Runs once when the Next.js server starts: schedules automatic job searches.
// The literal NEXT_RUNTIME check lets the bundler drop Node-only code from the
// edge build.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobSearchScheduler } = await import("./lib/jobsearch/scheduler");
    startJobSearchScheduler();
  }
}
