import { useState } from "react";
import { Copy, Check, FileText, Download, Mail, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoverLetter } from "@/types/job";

interface CoverLetterModalProps {
  coverLetter: CoverLetter | null;
  open: boolean;
  onClose: () => void;
}

export function CoverLetterModal({ coverLetter, open, onClose }: CoverLetterModalProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!coverLetter) return null;

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const downloadAsText = () => {
    const content = `Subject: ${coverLetter.suggested_subject_lines[0] || `Application for ${coverLetter.target_role.title}`}

${coverLetter.cover_letter}`;
    
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Cover_Letter_${coverLetter.target_role.company.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Format cover letter with proper paragraphs
  const formattedLetter = coverLetter.cover_letter
    .split(/\n\n|\n/)
    .filter(p => p.trim())
    .map((paragraph, idx) => (
      <p key={idx} className="mb-4 last:mb-0">
        {paragraph.trim()}
      </p>
    ));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cover Letter
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            For {coverLetter.target_role.title} at {coverLetter.target_role.company}
          </p>
        </DialogHeader>

        <div className="flex justify-end gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={downloadAsText}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(coverLetter.cover_letter, "letter")}
          >
            {copiedSection === "letter" ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy
          </Button>
        </div>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Subject Line Suggestions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Suggested Subject Lines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {coverLetter.suggested_subject_lines.map((subject, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-muted p-2 rounded text-sm"
                  >
                    <span>{subject}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(subject, `subject-${idx}`)}
                    >
                      {copiedSection === `subject-${idx}` ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Cover Letter Content */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Letter Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-4 rounded-md text-sm leading-relaxed">
                  {formattedLetter}
                </div>
              </CardContent>
            </Card>

            {/* Key Points Used */}
            {coverLetter.key_points_used.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Key Points Highlighted</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {coverLetter.key_points_used.map((point, idx) => (
                      <Badge key={idx} variant="secondary">
                        {point}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Final Checklist */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Quality Checklist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {coverLetter.final_checklist.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
