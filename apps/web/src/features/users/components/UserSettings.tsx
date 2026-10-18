import { RotateCcw } from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";

const pageSizeOptions = [5, 10, 20, 50].map((value) => ({
  label: `${value} rows`,
  value: String(value)
}));

function formatColumnLabel(columnId: string) {
  const labels: Record<string, string> = {
    email: "Email",
    firstName: "Name",
    role: "Role",
    status: "Status"
  };

  return labels[columnId] ?? columnId;
}

interface UserSettingsProps {
  columnVisibility: VisibilityState;
  pageSize: number;
  resetTable: () => void;
  setColumnVisibility: (value: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  setPageSize: (pageSize: number) => void;
}

export function UserSettings({
  columnVisibility,
  pageSize,
  resetTable,
  setColumnVisibility,
  setPageSize
}: UserSettingsProps) {
  return (
    <Card className="grid gap-5 p-5">
      <div>
        <p className="text-xs font-extrabold text-primary-ink">
          Table settings
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-app-text">
          Display preferences
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="settings-page-size" label="Default rows">
          <Select
            id="settings-page-size"
            onChange={(event) => setPageSize(Number(event.target.value))}
            options={pageSizeOptions}
            value={String(pageSize)}
          />
        </FormField>

        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-app-text">Visible columns</h3>
          <div className="grid gap-1 rounded-app border border-app-border bg-app-soft/45 p-3">
            {["email", "role", "status"].map(
              (columnId) => (
                <Checkbox
                  checked={columnVisibility[columnId] !== false}
                  id={`settings-${columnId}`}
                  key={columnId}
                  label={formatColumnLabel(columnId)}
                  onCheckedChange={(checked) =>
                    setColumnVisibility((current) => ({
                      ...current,
                      [columnId]: !!checked
                    }))
                  }
                />
              )
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={resetTable} type="button" variant="outline">
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Reset Table
        </Button>
      </div>
    </Card>
  );
}
