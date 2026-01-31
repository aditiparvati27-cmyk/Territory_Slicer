import { Layout } from "@/components/layout";
import { DatasetManager } from "@/components/dataset-manager";
import { useData } from "@/lib/logic";

export default function Dataset() {
  const { source, setDataset, resetToDefault } = useData();

  return (
    <Layout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-dataset-page-title">
          Upload Dataset
        </h1>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="text-dataset-page-subtitle">
          Upload your Reps and Accounts CSV files (same schema as the templates) to instantly re-run territory slicing.
        </p>

        <div className="mt-6">
          <DatasetManager
            source={source}
            onDatasetLoaded={(next) => setDataset(next)}
            onResetDefault={() => resetToDefault()}
          />
        </div>
      </div>
    </Layout>
  );
}
