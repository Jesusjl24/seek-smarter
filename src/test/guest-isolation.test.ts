import { describe, it, expect, beforeEach, vi } from "vitest";

// Any touch of the real backend client in guest mode is a failure.
vi.mock("@/integrations/supabase/client", () => {
  const forbidden = () => {
    throw new Error("Guest mode must not call the backend");
  };
  return {
    supabase: {
      from: forbidden,
      auth: { getUser: forbidden, getSession: forbidden },
      functions: { invoke: forbidden },
      storage: { from: forbidden },
    },
  };
});

import { enableGuest, exitGuest } from "@/lib/guest";
import {
  fetchJobsByStatus,
  fetchPipelineCounts,
  fetchJobArtifacts,
  upsertJobs,
} from "@/lib/api/jobs";
import { fetchResumeProfile, getResumeSignedUrl } from "@/lib/api/resume";

describe("guest mode stays local-only", () => {
  beforeEach(() => {
    enableGuest();
  });

  it("reads jobs, counts and artifacts without the backend", async () => {
    await expect(fetchJobsByStatus("inbox")).resolves.toBeInstanceOf(Array);
    await expect(fetchPipelineCounts()).resolves.toHaveProperty("inbox");
    await expect(fetchJobArtifacts("demo")).resolves.toBeInstanceOf(Array);
    await expect(upsertJobs([])).resolves.toHaveProperty("newCount");
  });

  it("reads the resume profile locally and never signs storage URLs", async () => {
    await expect(fetchResumeProfile()).resolves.not.toBeUndefined();
    await expect(getResumeSignedUrl({ file_path: "x/y/z.pdf" })).resolves.toBeNull();
  });

  it("does not leak guest state to authenticated sessions", () => {
    exitGuest();
    expect(localStorage.getItem("seek-smarter:guest")).toBeNull();
  });
});
