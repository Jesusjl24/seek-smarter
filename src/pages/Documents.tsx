import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, FileText, Mail, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionPanel } from "@/components/today/SectionPanel";
import { TruthCheckBadge } from "@/components/documents/TruthCheckBadge";
import { DocumentDetailDialog } from "@/components/documents/DocumentDetailDialog";
import {
  fetchDocumentWorkspace,
  jobMaterialsStatus,
  revisionHistory,
  truthStatusOf,
  type DocumentWorkspace,
  type RevisionWithJob,
} from "@/lib/api/documentRevisions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

function RevisionRow({
  revision,
  onOpen,
}: {
  revision: RevisionWithJob;
  onOpen: (r: RevisionWithJob) => void;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-3 py-2.5"
      data-testid="document-item"
      data-kind={revision.document_type}
    >
      {revision.document_type === "resume" ? (
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {revision.job ? `${revision.job.title} · ${revision.job.company}` : revision.label}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Revision {revision.revision_number} · {revision.agent_version} ·{" "}
          {format(new Date(revision.generated_at), "d MMM yyyy")} ·{" "}
          {revision.content_hash.slice(0, 10)}
        </p>
      </div>
      <TruthCheckBadge status={truthStatusOf(revision)} />
      <Badge variant={revision.approval_status === "approved" ? "default" : "secondary"}>
        {revision.approval_status}
      </Badge>
      <Button size="sm" variant="outline" onClick={() => onOpen(revision)}>
        Review
      </Button>
    </li>
  );
}

const Documents = () => {
  const [workspace, setWorkspace] = useState<DocumentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RevisionWithJob | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setWorkspace(await fetchDocumentWorkspace());
    } catch (e) {
      console.error("Failed to load documents:", e);
      toast({ title: "Could not load documents", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const materials = useMemo(
    () => (workspace ? jobMaterialsStatus(workspace) : []),
    [workspace]
  );

  const history = useMemo(() => {
    if (!workspace || !selected) return [];
    const pool =
      selected.document_type === "resume"
        ? workspace.tailoredResumes
        : workspace.coverLetters;
    return revisionHistory(pool, selected.job_id, selected.document_type as "resume" | "cover_letter");
  }, [workspace, selected]);

  if (loading || !workspace) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="documents-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            One approved master resume, plus every role-specific revision the assistant drafts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
          Refresh
        </Button>
      </header>

      <Card data-testid="documents-master">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <User className="h-5 w-5 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Master resume — source of truth</p>
            <p className="truncate text-xs text-muted-foreground">
              {workspace.master
                ? `${workspace.master.file_name ?? "Uploaded resume"}${
                    workspace.master.revision_number
                      ? ` · revision ${workspace.master.revision_number}`
                      : ""
                  }${
                    workspace.master.updated_at
                      ? ` · updated ${format(new Date(workspace.master.updated_at), "d MMM yyyy")}`
                      : ""
                  }`
                : "No master resume uploaded yet."}
            </p>
          </div>
          <Badge variant="outline">Never overwritten automatically</Badge>
        </CardContent>
      </Card>

      <SectionPanel
        title="Per-job materials"
        count={materials.length}
        isEmpty={materials.length === 0}
        emptyMessage="No role-specific documents yet."
      >
        <ul className="divide-y" data-testid="job-materials">
          {materials.map((m) => (
            <li key={m.job.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.job.title} · {m.job.company}
                </p>
                <p className="text-xs text-muted-foreground">
                  Resume: {m.resume ? `rev ${m.resume.revision_number}` : "none"}
                  {m.resumeApproved ? " (approved)" : ""} · Cover letter:{" "}
                  {m.coverLetter ? `rev ${m.coverLetter.revision_number}` : "none"}
                  {m.coverLetterApproved ? " (approved)" : ""}
                </p>
              </div>
              <Badge variant={m.packageReady ? "default" : "secondary"}>{m.label}</Badge>
            </li>
          ))}
        </ul>
      </SectionPanel>

      <Tabs defaultValue="tailored">
        <TabsList>
          <TabsTrigger value="tailored" data-testid="documents-tab-tailored">
            Tailored resumes ({workspace.tailoredResumes.length})
          </TabsTrigger>
          <TabsTrigger value="letters" data-testid="documents-tab-letters">
            Cover letters ({workspace.coverLetters.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tailored" className="mt-4">
          <SectionPanel
            title="Tailored resume revisions"
            count={workspace.tailoredResumes.length}
            isEmpty={workspace.tailoredResumes.length === 0}
            emptyMessage="No tailored resumes yet. Generate one from a shortlisted role."
          >
            <ul className="divide-y">
              {workspace.tailoredResumes.map((r) => (
                <RevisionRow key={r.id} revision={r} onOpen={setSelected} />
              ))}
            </ul>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="letters" className="mt-4">
          <SectionPanel
            title="Cover letter revisions"
            count={workspace.coverLetters.length}
            isEmpty={workspace.coverLetters.length === 0}
            emptyMessage="No cover letters yet."
          >
            <ul className="divide-y">
              {workspace.coverLetters.map((r) => (
                <RevisionRow key={r.id} revision={r} onOpen={setSelected} />
              ))}
            </ul>
          </SectionPanel>
        </TabsContent>
      </Tabs>

      <DocumentDetailDialog
        revision={selected}
        history={history}
        masterText={workspace.master?.raw_text ?? ""}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          load();
        }}
      />
    </div>
  );
};

export default Documents;
