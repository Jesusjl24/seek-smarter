import { useState } from "react";
import { Copy, Check, FileText, Lightbulb, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TailoredResume } from "@/types/job";

interface TailoredResumeModalProps {
  resume: TailoredResume | null;
  open: boolean;
  onClose: () => void;
}

export function TailoredResumeModal({ resume, open, onClose }: TailoredResumeModalProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!resume) return null;

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const copyAllContent = async () => {
    const fullContent = `
TAILORED RESUME SUGGESTIONS FOR: ${resume.target_role.title} at ${resume.target_role.company}

KEYWORDS TO INJECT:
${resume.keywords_to_inject.join(", ")}

SKILLS TO EMPHASIZE:
${resume.skills_to_emphasize.join(", ")}

SUMMARY REWRITE:
${resume.summary_rewrite}

BULLET REWRITES:
${resume.bullet_rewrites.map((b, i) => `
${i + 1}. ${b.section}
   BEFORE: ${b.before}
   AFTER: ${b.after}
   WHY: ${b.why}
`).join("")}

GAP MITIGATION:
${resume.gap_mitigation.map((g) => `- ${g.gap}: ${g.workaround}`).join("\n")}

NOTES:
${resume.final_notes}
`.trim();

    await copyToClipboard(fullContent, "all");
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Tailored Resume Suggestions
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            For {resume.target_role.title} at {resume.target_role.company}
          </p>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={copyAllContent}>
            {copiedSection === "all" ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy All
          </Button>
        </div>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Keywords to Inject */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  Keywords to Inject
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {resume.keywords_to_inject.map((keyword, idx) => (
                    <Badge key={idx} variant="secondary">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Skills to Emphasize */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Skills to Emphasize</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {resume.skills_to_emphasize.map((skill, idx) => (
                    <Badge key={idx} variant="outline" className="border-primary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Summary Rewrite */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Summary Rewrite</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(resume.summary_rewrite, "summary")}
                  >
                    {copiedSection === "summary" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm bg-muted p-3 rounded-md">{resume.summary_rewrite}</p>
              </CardContent>
            </Card>

            {/* Bullet Rewrites */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bullet Rewrites</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {resume.bullet_rewrites.map((bullet, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{bullet.section}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(bullet.after, `bullet-${idx}`)}
                      >
                        {copiedSection === `bullet-${idx}` ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="bg-destructive/10 p-2 rounded border-l-2 border-destructive">
                        <span className="font-medium text-destructive">Before:</span>{" "}
                        {bullet.before}
                      </div>
                      <div className="bg-green-500/10 p-2 rounded border-l-2 border-green-500">
                        <span className="font-medium text-green-600">After:</span>{" "}
                        {bullet.after}
                      </div>
                      <div className="text-muted-foreground italic pl-2">
                        Why: {bullet.why}
                      </div>
                    </div>
                    {idx < resume.bullet_rewrites.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Gap Mitigation */}
            {resume.gap_mitigation.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Gap Mitigation Strategies
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resume.gap_mitigation.map((gap, idx) => (
                    <div key={idx} className="text-sm">
                      <div className="font-medium text-destructive">{gap.gap}</div>
                      <div className="text-muted-foreground mt-1">{gap.workaround}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Final Notes */}
            {resume.final_notes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Final Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{resume.final_notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
