// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "../src/db.js";
import type { Config } from "../src/config.js";
import { draftAGradePackages } from "../src/lib/pipelineDrafts.js";

const config = { aiProvider: "openai", openaiApiKey: "test-key" } as Config;
const resume = vi.fn(async () => ({ summary_rewrite: "Tailored", skills_to_emphasize: ["TypeScript"] }));
const cover = vi.fn(async () => ({ cover_letter: "Dear hiring manager" }));
const job = (id: string) => ({ id, grade: "A", match_score: 90, title: "Engineer", company: "Example", location: "Sydney", description_snippet: "Build things" });

describe("A-grade pipeline drafts", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = openDatabase(":memory:"); resume.mockClear(); cover.mockClear();
    db.prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES('u','u@example.test','x','now')").run();
  });
  const addJob = (id: string) => db.prepare("INSERT INTO jobs(id,user_id,seek_job_id,title,company,location,description_snippet,job_url,date_scraped,pipeline_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, "u", id, "Engineer", "Example", "Sydney", "Build things", "https://example.test", "now", "inbox", "now");
  const addProfile = () => db.prepare("INSERT INTO resume_profile(id,user_id,raw_text,updated_at) VALUES('p','u','Verified resume','now')").run();

  it("persists pending resume and cover revisions plus artifacts", async () => {
    addProfile(); addJob("j1");
    const result = await draftAGradePackages(db, config, "u", [job("j1")], { generateResume: resume, generateCover: cover });
    expect(result.jobs_drafted).toBe(1);
    const revisions = db.prepare("SELECT * FROM document_revisions ORDER BY document_type").all() as any[];
    expect(revisions).toHaveLength(2);
    expect(revisions.every((row) => row.approval_status === "pending" && row.truth_check_status === "pending")).toBe(true);
    expect(revisions.map((row) => row.document_type).sort()).toEqual(["cover_letter", "resume"]);
    expect((db.prepare("SELECT count(*) count FROM job_artifacts").get() as any).count).toBe(2);
    expect(db.prepare("SELECT count(*) count FROM document_revisions WHERE approval_status='approved'").get()).toMatchObject({ count: 0 });
  });

  it("caps drafting at three A-grade jobs", async () => {
    addProfile(); ["j1", "j2", "j3", "j4"].forEach(addJob);
    const result = await draftAGradePackages(db, config, "u", ["j1", "j2", "j3", "j4"].map(job), { generateResume: resume, generateCover: cover });
    expect(result.jobs_drafted).toBe(3); expect(resume).toHaveBeenCalledTimes(3); expect(cover).toHaveBeenCalledTimes(3);
    expect((db.prepare("SELECT count(*) count FROM document_revisions WHERE job_id='j4'").get() as any).count).toBe(0);
  });

  it("does not duplicate active revisions or existing artifacts", async () => {
    addProfile(); addJob("j1");
    db.prepare("INSERT INTO document_revisions(id,user_id,job_id,document_type,revision_number,content,content_hash,truth_check_status,approval_status,created_at,updated_at) VALUES('r','u','j1','resume',1,'{}','h','pending','approved','now','now')").run();
    db.prepare("INSERT INTO job_artifacts VALUES('a','u','j1','cover_letter','{}','old','1','now')").run();
    await draftAGradePackages(db, config, "u", [job("j1")], { generateResume: resume, generateCover: cover });
    expect(resume).not.toHaveBeenCalled(); expect(cover).not.toHaveBeenCalled();
    expect((db.prepare("SELECT count(*) count FROM document_revisions").get() as any).count).toBe(1);
  });

  it("returns a skip reason when no draft profile exists", async () => {
    addJob("j1");
    const result = await draftAGradePackages(db, config, "u", [job("j1")], { generateResume: resume, generateCover: cover });
    expect(result.jobs_drafted).toBe(0); expect(result.skipped.join(" ")).toContain("no resume profile");
    expect((db.prepare("SELECT count(*) count FROM document_revisions").get() as any).count).toBe(0);
  });
});
