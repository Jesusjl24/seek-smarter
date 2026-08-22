import { useCallback, useEffect, useState } from "react";
import { FileText, Mail, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionPanel } from "@/components/today/SectionPanel";
import { fetchDocumentLibrary, type DocumentItem, type DocumentLibrary } from "@/lib/api/documents";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

function DocumentRow({
  item,
  onOpen,
}: {
  item: DocumentItem;
  onOpen: (item: DocumentItem) => void;
}) {
  return (
    <li
      className="flex items-center gap-3 py-2.5"
      data-testid="document-item"
      data-kind={item.kind}
    >
      {item.kind === "tailored_resume" ? (
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.job_title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {item.company}
          {item.score !== null && ` · score ${item.score}`} ·{" "}
          {format(new Date(item.created_at), "d MMM yyyy")}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onOpen(item)}>
        Open
      </Button>
    </li>
  );
}

const Documents = () => {
  const [library, setLibrary] = useState<DocumentLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLibrary(await fetchDocumentLibrary());
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

  if (loading || !library) {
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
            Your master resume plus every tailored version and cover letter.
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
            <p className="text-sm font-medium">Master resume</p>
            <p className="truncate text-xs text-muted-foreground">
              {library.master
                ? `${library.master.file_name ?? "Uploaded resume"} · updated ${format(
                    new Date(library.master.updated_at),
                    "d MMM yyyy"
                  )}`
                : "No master resume uploaded yet."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tailored">
        <TabsList>
          <TabsTrigger value="tailored" data-testid="documents-tab-tailored">
            Tailored resumes ({library.tailored.length})
          </TabsTrigger>
          <TabsTrigger value="letters" data-testid="documents-tab-letters">
            Cover letters ({library.coverLetters.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tailored" className="mt-4">
          <SectionPanel
            title="Tailored resume versions"
            count={library.tailored.length}
            isEmpty={library.tailored.length === 0}
            emptyMessage="No tailored resumes yet. Generate one from a shortlisted role."
          >
            <ul className="divide-y">
              {library.tailored.map((item) => (
                <DocumentRow key={item.id} item={item} onOpen={setSelected} />
              ))}
            </ul>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="letters" className="mt-4">
          <SectionPanel
            title="Cover letters"
            count={library.coverLetters.length}
            isEmpty={library.coverLetters.length === 0}
            emptyMessage="No cover letters yet."
          >
            <ul className="divide-y">
              {library.coverLetters.map((item) => (
                <DocumentRow key={item.id} item={item} onOpen={setSelected} />
              ))}
            </ul>
          </SectionPanel>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.kind === "cover_letter" ? "Cover letter" : "Tailored resume"} ·{" "}
              {selected?.job_title}
            </DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm">
            {JSON.stringify(selected?.content ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;
