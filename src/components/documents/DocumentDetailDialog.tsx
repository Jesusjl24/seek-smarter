import { useMemo, useState } from "react";
import { Download, FileText, GitCompare, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { DocumentDiff } from "./DocumentDiff";
import { TruthCheckBadge } from "./TruthCheckBadge";
import { contentToLines } from "@/lib/documents/content";
import { blockedReason, canApproveDocument, type TruthCheckResult } from "@/lib/documents/truthCheck";
import {
  approveDocumentRevision,
  manuallyApproveTruthCheck,
  readContent,
  requestDocumentEdit,
  signedDocumentUrl,
  truthStatusOf,
  type RevisionWithJob,
} from "@/lib/api/documentRevisions";
import { useToast } from "@/hooks/use-toast";

interface Props {
  revision: RevisionWithJob | null;
  history: RevisionWithJob[];
  masterText: string;
  onClose: () => void;
  onChanged: () => void;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function DocumentDetailDialog({
  revision,
  history,
  masterText,
  onClose,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [compareId, setCompareId] = useState<string>("master");

  const content = useMemo(() => (revision ? readContent(revision) : null), [revision]);
  const truth = (revision?.truth_check ?? null) as unknown as TruthCheckResult | null;
  const status = revision ? truthStatusOf(revision) : "pending";

  const afterLines = content ? contentToLines(content) : [];
  const comparison = useMemo(() => {
    if (compareId === "master") {
      return { label: "Master resume", lines: masterText.split("\n") };
    }
    const other = history.find((r) => r.id === compareId);
    return other
      ? { label: `Revision ${other.revision_number}`, lines: contentToLines(readContent(other)) }
      : { label: "Master resume", lines: masterText.split("\n") };
  }, [compareId, history, masterText]);

  if (!revision || !content) return null;

  const blocked = truth ? blockedReason(truth) : !canApproveDocument(status)
    ? "Approval blocked — truth check has not passed yet."
    : null;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: success });
      onChanged();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const download = async (path: string | null, kind: string) => {
    if (!path) {
      toast({ title: `No ${kind} available for this revision`, variant: "destructive" });
      return;
    }
    await run(async () => {
      const url = await signedDocumentUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    }, `${kind} download started`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        data-testid="document-detail"
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4" aria-hidden />
            {revision.label ?? "Document"} · revision {revision.revision_number}
          </DialogTitle>
          <DialogDescription>
            {revision.job
              ? `${revision.job.title} · ${revision.job.company}`
              : "Not linked to a specific role"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <TruthCheckBadge status={status} />
          <span className="text-xs text-muted-foreground">
            Approval: {revision.approval_status}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-3">
          <Meta label="Target job" value={revision.job?.title ?? "General"} />
          <Meta
            label="Source resume revision"
            value={revision.source_resume_revision_id ?? "Master profile text"}
          />
          <Meta label="Agent version" value={revision.agent_version} />
          <Meta
            label="Generated"
            value={format(new Date(revision.generated_at), "d MMM yyyy, HH:mm")}
          />
          <Meta label="Document revision" value={`#${revision.revision_number}`} />
          <Meta label="Content hash" value={revision.content_hash} />
          <Meta
            label="Supporting facts"
            value={
              revision.supporting_fact_ids.length
                ? `${revision.supporting_fact_ids.length} verified facts`
                : "None recorded"
            }
          />
        </dl>

        {truth && truth.unsupported.length > 0 && (
          <div
            className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
            data-testid="truth-check-issues"
          >
            <p className="text-sm font-medium text-destructive">{truth.summary}</p>
            <ul className="space-y-1.5 text-xs">
              {truth.unsupported.slice(0, 8).map((claim) => (
                <li key={claim.claim}>
                  <span className="font-medium">“{claim.claim}”</span> — {claim.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Separator />

        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Compare revisions</span>
            <Select value={compareId} onValueChange={setCompareId}>
              <SelectTrigger className="h-8 w-56" data-testid="compare-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="master">Master resume</SelectItem>
                {history
                  .filter((r) => r.id !== revision.id)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Revision {r.revision_number} ·{" "}
                      {format(new Date(r.created_at), "d MMM")}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DocumentDiff
            beforeLabel={comparison.label}
            afterLabel={`Revision ${revision.revision_number}`}
            before={comparison.lines}
            after={afterLines}
          />
        </section>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => download(revision.pdf_path, "PDF")}
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => download(revision.docx_path, "DOCX")}
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            DOCX
          </Button>
        </div>

        {blocked && (
          <p className="rounded-md bg-muted p-3 text-sm" data-testid="approval-blocked">
            {blocked}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || !canApproveDocument(status)}
            data-testid="approve-document"
            onClick={() =>
              run(
                () => approveDocumentRevision(revision.id, revision.content_hash),
                "Document approved"
              )
            }
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
            Approve document
          </Button>
          {!canApproveDocument(status) && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="manual-truth-approve"
              onClick={() =>
                run(
                  () => manuallyApproveTruthCheck(revision.id),
                  "Truth check manually approved"
                )
              }
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
              I can evidence these claims
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="What should change in the next revision?"
            data-testid="request-edit-note"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy || editNote.trim().length < 3}
            data-testid="request-edit"
            onClick={() =>
              run(
                () => requestDocumentEdit(revision.id, revision.content_hash, editNote.trim()),
                "Edit requested — regenerate to create a new revision"
              )
            }
          >
            Request edit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
