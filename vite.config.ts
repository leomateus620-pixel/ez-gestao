import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function getPackageName(id: string) {
  const normalized = id.split(path.sep).join("/");
  const nodeModulesIndex = normalized.lastIndexOf("/node_modules/");
  if (nodeModulesIndex === -1) return null;

  const parts = normalized.slice(nodeModulesIndex + "/node_modules/".length).split("/");
  if (!parts[0]) return null;
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const packageName = getPackageName(id);
          if (!packageName) return undefined;
          if (packageName === "react" || packageName === "react-dom" || packageName === "scheduler") return "vendor-react";
          if (packageName.startsWith("@supabase/")) return "vendor-supabase";
          if (packageName.startsWith("@tanstack/")) return "vendor-query";
          if (packageName.startsWith("@radix-ui/") || packageName === "lucide-react") return "vendor-ui";
          return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
