import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Briefcase, GraduationCap, Award, Building2, Clock } from "lucide-react";
import type { ResumeProfile } from "@/types/job";

interface ResumeViewModalProps {
  profile: ResumeProfile | null;
  open: boolean;
  onClose: () => void;
}

export function ResumeViewModal({ profile, open, onClose }: ResumeViewModalProps) {
  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">Your Resume Profile</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-5">
            {profile.summary && (
              <div>
                <h3 className="font-semibold mb-2">Summary</h3>
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

            {profile.skills_technical.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Technical Skills</h3>
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
                <h3 className="font-semibold mb-2">Soft Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills_soft.map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {profile.previous_titles.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-1.5">
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
                <h3 className="font-semibold mb-2 flex items-center gap-1.5">
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

            {profile.education.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-1.5">
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
                <h3 className="font-semibold mb-2 flex items-center gap-1.5">
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
