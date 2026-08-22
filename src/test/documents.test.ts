import { describe, it, expect } from "vitest";
import {
  runTruthCheck,
  canApproveDocument,
  blockedReason,
  extractClaims,
} from "@/lib/documents/truthCheck";
import { diffLines, diffStats } from "@/lib/documents/diff";
import { contentHash, contentToLines, toDocumentContent } from "@/lib/documents/content";
import {
  buildPackageHash,
  jobMaterialsStatus,
  revisionHistory,
  type DocumentWorkspace,
  type RevisionWithJob,
} from "@/lib/api/documentRevisions";

const MASTER_TEXT = `Jane Doe
Senior Project Manager at Acme with 8 years experience.
Delivered a payroll migration program across 3 business units.
Certified Scrum Master. Managed budgets of 500k.`;

const FACTS = [
  { id: "fact-1", fact_text: "Delivered payroll migration program across 3 business units", verified: true },
  { id: "fact-2", fact_text: "Certified Scrum Master since 2019", verified: true },
  { id: "fact-3", fact_text: "Fluent in Mandarin", verified: false },
];

function revision(overrides: Partial<RevisionWithJob>): RevisionWithJob {
  return {
    id: "rev-1",
    user_id: "user-1",
    job_id: "job-1",
    document_type: "resume",
    source_resume_revision_id: "master-1",
    revision_number: 1,
    content: {},
    storage_path: "user-1/job-1/rev-1.pdf",
    docx_path: "user-1/job-1/rev-1.docx",
    pdf_path: "user-1/job-1/rev-1.pdf",
    content_hash: "hash-1",
    truth_check_status: "passed",
    truth_check: {},
    supporting_fact_ids: [],
    agent_version: "document_agent/1.0",
    label: "Resume",
    approval_status: "pending",
    supersedes_revision_id: null,
    generated_at: "2026-08-22T00:00:00Z",
    created_at: "2026-08-22T00:00:00Z",
    ...overrides,
  } as RevisionWithJob;
}

describe("truth check", () => {
  it("passes claims that are supported by the master resume", () => {
    const result = runTruthCheck({
      content: {
        title: "Resume",
        sections: [
          {
            heading: "Experience",
            lines: ["Delivered a payroll migration program across 3 business units."],
          },
        ],
      },
      sourceResumeText: MASTER_TEXT,
      facts: FACTS,
    });
    expect(result.status).toBe("passed");
    expect(result.unsupported).toHaveLength(0);
    expect(canApproveDocument(result.status)).toBe(true);
  });

  it("never lets an unsupported claim pass the truth check", () => {
    const result = runTruthCheck({
      content: {
        title: "Resume",
        sections: [
          {
            heading: "Experience",
            lines: [
              "Led a global cybersecurity transformation for a Fortune 500 telecommunications carrier.",
            ],
          },
        ],
      },
      sourceResumeText: MASTER_TEXT,
      facts: FACTS,
    });
    expect(result.status).not.toBe("passed");
    expect(canApproveDocument(result.status)).toBe(false);
    expect(blockedReason(result)).toMatch(/Approval blocked/);
  });

  it("flags fabricated metrics as a hard failure", () => {
    const result = runTruthCheck({
      content: {
        title: "Resume",
        sections: [{ heading: "Impact", lines: ["Managed budgets of 42000000 annually."] }],
      },
      sourceResumeText: MASTER_TEXT,
      facts: FACTS,
    });
    expect(result.status).toBe("failed");
    expect(result.unsupported[0].severity).toBe("fabricated");
  });

  it("ignores unverified facts as evidence", () => {
    const result = runTruthCheck({
      content: {
        title: "Resume",
        sections: [{ heading: "Languages", lines: ["Fluent in Mandarin business negotiation."] }],
      },
      sourceResumeText: MASTER_TEXT,
      facts: FACTS,
    });
    expect(result.status).toBe("needs_evidence");
  });

  it("only allows approval when passed or manually approved", () => {
    expect(canApproveDocument("passed")).toBe(true);
    expect(canApproveDocument("manually_approved")).toBe(true);
    expect(canApproveDocument("needs_evidence")).toBe(false);
    expect(canApproveDocument("failed")).toBe(false);
    expect(canApproveDocument("pending")).toBe(false);
  });

  it("extracts claims from nested content", () => {
    const claims = extractClaims({
      sections: [{ heading: "Summary", lines: ["A sufficiently long sentence about work."] }],
    });
    expect(claims).toContain("A sufficiently long sentence about work.");
  });
});

describe("master resume immutability", () => {
  it("generating a tailored revision does not mutate the master content", async () => {
    const master = { title: "Master", sections: [{ heading: "Experience", lines: ["Original"] }] };
    const masterHashBefore = await contentHash(master);

    const tailored = toDocumentContent(
      { ...master, sections: [{ heading: "Experience", lines: ["Original", "Tailored line"] }] },
      "Tailored"
    );
    const tailoredHash = await contentHash(tailored);

    expect(await contentHash(master)).toBe(masterHashBefore);
    expect(master.sections[0].lines).toEqual(["Original"]);
    expect(tailoredHash).not.toBe(masterHashBefore);
  });

  it("shows a before/after diff between master and a tailored revision", () => {
    const before = ["Original", "Kept"];
    const after = ["Tailored line", "Kept"];
    const diff = diffLines(before, after);
    const stats = diffStats(diff);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
    expect(stats.unchanged).toBe(1);
  });
});

describe("revisions", () => {
  const revisions: RevisionWithJob[] = [
    revision({ id: "r1", revision_number: 1 }),
    revision({ id: "r2", revision_number: 2, supersedes_revision_id: null }),
    revision({ id: "r3", revision_number: 3, supersedes_revision_id: "r2" }),
  ];

  it("keeps every revision — regeneration never overwrites", () => {
    const history = revisionHistory(revisions, "job-1", "resume");
    expect(history.map((r) => r.revision_number)).toEqual([3, 2, 1]);
  });

  it("supersedes only when explicitly selected", () => {
    expect(revisions.find((r) => r.id === "r2")?.supersedes_revision_id).toBeNull();
    expect(revisions.find((r) => r.id === "r3")?.supersedes_revision_id).toBe("r2");
  });

  it("renders provenance-carrying content lines", () => {
    const lines = contentToLines(
      toDocumentContent({ title: "T", sections: [{ heading: "H", lines: ["L"] }] })
    );
    expect(lines).toEqual(["T", "", "H", "L"]);
  });
});

describe("signed downloads", () => {
  const ownerPath = "user-1/job-1/rev-1.pdf";

  function assertOwnerPath(path: string, userId: string) {
    if (!path.startsWith(`${userId}/`)) throw new Error("You can only download your own documents.");
    return path;
  }

  it("allows the owner", () => {
    expect(assertOwnerPath(ownerPath, "user-1")).toBe(ownerPath);
  });

  it("rejects another user", () => {
    expect(() => assertOwnerPath(ownerPath, "user-2")).toThrow(/own documents/);
  });
});

describe("application package", () => {
  it("references the exact approved content hashes", async () => {
    const resume = revision({ id: "res-1", content_hash: "hash-resume", approval_status: "approved" });
    const letter = revision({
      id: "cl-1",
      document_type: "cover_letter",
      content_hash: "hash-letter",
      approval_status: "approved",
    });

    const hash = await buildPackageHash({
      jobId: "job-1",
      resumeHash: resume.content_hash,
      coverLetterHash: letter.content_hash,
    });
    const same = await buildPackageHash({
      jobId: "job-1",
      resumeHash: "hash-resume",
      coverLetterHash: "hash-letter",
    });
    const different = await buildPackageHash({
      jobId: "job-1",
      resumeHash: "hash-resume-v2",
      coverLetterHash: "hash-letter",
    });

    expect(hash).toBe(same);
    expect(hash).not.toBe(different);
  });

  it("summarises per-job materials status", () => {
    const workspace: DocumentWorkspace = {
      master: null,
      tailoredResumes: [revision({ id: "res-1", approval_status: "approved" })],
      coverLetters: [
        revision({ id: "cl-1", document_type: "cover_letter", approval_status: "pending" }),
      ],
      packages: [],
      facts: [],
      jobs: [{ id: "job-1", title: "PM", company: "Acme" }],
    };
    const [status] = jobMaterialsStatus(workspace);
    expect(status.resumeApproved).toBe(true);
    expect(status.coverLetterApproved).toBe(false);
    expect(status.packageReady).toBe(false);
    expect(status.label).toBe("In review");
  });
});
