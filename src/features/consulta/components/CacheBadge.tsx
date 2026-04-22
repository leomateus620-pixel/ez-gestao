import { Badge } from "@/components/ui/badge";
import { Clock, Database, RefreshCw } from "lucide-react";

interface Props {
  fromCache: boolean;
  cacheValidUntil?: string | null;
}

export function CacheBadge({ fromCache, cacheValidUntil }: Props) {
  if (fromCache) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Database className="h-3 w-3" /> Cache
      </Badge>
    );
  }
  if (cacheValidUntil) {
    const valid = new Date(cacheValidUntil) > new Date();
    return (
      <Badge variant={valid ? "default" : "outline"} className="gap-1">
        {valid ? <Clock className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
        {valid ? "Consultado agora" : "Expirada"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <RefreshCw className="h-3 w-3" /> Consultado agora
    </Badge>
  );
}