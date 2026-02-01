import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Briefcase, GraduationCap, Award, Building2, Clock, FileText, Download } from "lucide-react";
import { PDFViewer } from "./PDFViewer";
import type { ResumeProfile } from "@/types/job";

interface ResumeViewModalProps {
  profile: ResumeProfile | null;
  open: boolean;
  onClose: () => void;
}

export function ResumeViewModal({ profile, open, onClose }: ResumeViewModalProps) {
  if (!profile) return null;

  const isPDF = profile.file_type === "application/pdf";
  const hasFile = !!profile.file_url;

  const getFileTypeLabel = () => {
    if (profile.file_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return "Word Document";
    }
    if (profile.file_type === "text/plain") {
      return "Text File";
    }
    return "Document";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex-1">
            <DialogTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Your Resume Profile
            </DialogTitle>
            {profile.file_name && (
              <p className="text-sm text-muted-foreground mt-1">{profile.file_name}</p>
            )}
          </div>
          {hasFile && (
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <a href={profile.file_url!} download={profile.file_name || "resume"}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Document Preview Section */}
          {hasFile && (
            <div className="shrink-0">
              {isPDF ? (
                <PDFViewer fileUrl={profile.file_url!} fileName={profile.file_name || undefined} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-8 border rounded-lg bg-muted/50">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">{getFileTypeLabel()}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Preview not available for this file type
                    </p>
                  </div>
                  <Button asChild>
                    <a href={profile.file_url!} download={profile.file_name || "resume"}>
                      <Download className="h-4 w-4 mr-2" />
                      Download {getFileTypeLabel()}
                    </a>
                  </Button>
                  {/* Show raw text if available for non-PDF files */}
                  {profile.raw_text && (
                    <ScrollArea className="w-full max-h-40 mt-4 border rounded bg-background">
                      <pre className="p-4 text-xs whitespace-pre-wrap font-mono">
                        {profile.raw_text.slice(0, 2000)}
                        {profile.raw_text.length > 2000 && "..."}
                      </pre>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Extracted Data Section */}
          <Accordion type="single" collapsible defaultValue={hasFile ? undefined : "extracted-data"} className="flex-1 overflow-hidden">
            <AccordionItem value="extracted-data" className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <span className="font-semibold">Extracted Resume Data</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <ExtractedDataView profile={profile} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExtractedDataView({ profile }: { profile: ResumeProfile }) {
  return (
    <ScrollArea className="max-h-[40vh] pr-4">
      <div className="space-y-4">
        {profile.summary && (
          <div>
            <h3 className="font-semibold mb-2 text-sm">Summary</h3>
            <p className="text-sm text-muted-foreground">{profile.summary}</p>
          </div>
        )}

        {profile.years_experience && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{profile.years_experience} years of experience</span>
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.skills_technical.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-sm">Technical Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills_technical.map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {profile.skills_soft.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-sm">Soft Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills_soft.map((skill) => (
                  <Badge key={skill} variant="outline" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.previous_titles.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                <Briefcase className="h-4 w-4" />
                Previous Roles
              </h3>
              <ul className="text-sm space-y-1">
                {profile.previous_titles.map((title, i) => (
                  <li key={i} className="text-muted-foreground">• {title}</li>
                ))}
              </ul>
            </div>
          )}

          {profile.industries.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                Industries
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.industries.map((industry) => (
                  <Badge key={industry} variant="outline" className="text-xs">
                    {industry}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.education.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4" />
                Education
              </h3>
              <ul className="text-sm space-y-1">
                {profile.education.map((edu, i) => (
                  <li key={i} className="text-muted-foreground">• {edu}</li>
                ))}
              </ul>
            </div>
          )}

          {profile.certifications.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                <Award className="h-4 w-4" />
                Certifications
              </h3>
              <ul className="text-sm space-y-1">
                {profile.certifications.map((cert, i) => (
                  <li key={i} className="text-muted-foreground">• {cert}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
