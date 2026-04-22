import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, FileText, Download } from "lucide-react";

interface Props { artifacts?: any[] }

export function ArtifactViewer({ artifacts }: Props) {
  if (!artifacts || artifacts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">Nenhuma evidência capturada ainda.</div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {artifacts.map((a) => (
        <Card key={a.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              {a.artifact_type === "screenshot" ? <Camera className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              {a.artifact_type} · {a.file_path.split("/").pop()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {a.signed_url && a.mime_type?.startsWith("image/") && (
              <img src={a.signed_url} alt={a.file_path} className="w-full rounded-md border max-h-48 object-contain bg-muted/30" />
            )}
            {a.signed_url && (
              <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                <a href={a.signed_url} target="_blank" rel="noreferrer"><Download className="h-3 w-3 mr-1" /> Baixar</a>
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}