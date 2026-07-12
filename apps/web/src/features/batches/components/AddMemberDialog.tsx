import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import type { BatchUserSummary } from "@nexa-gen/types";

type AddMemberDialogProps = {
  members: BatchUserSummary[];
  onAdd: (id: string) => void;
  type: "Coach" | "Student";
};

export function AddMemberDialog({ members, onAdd, type }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = members.filter(m => (m.firstName + " " + (m.lastName || "") + " " + m.email).toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setSearch(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs bg-app-surface shadow-sm">
          <UserPlus className="mr-1.5 size-3.5" /> Add {type}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {type}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
             {filtered.map(m => (
               <div key={m.id} className="flex items-center justify-between p-3 border border-app-border rounded-lg shadow-sm hover:border-primary/40 transition-colors">
                 <div className="flex items-center gap-3">
                   <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                     {m.firstName.charAt(0)}{m.lastName ? m.lastName.charAt(0) : ""}
                   </div>
                   <div>
                     <p className="text-sm font-semibold">{m.firstName} {m.lastName || ""}</p>
                     <p className="text-xs text-app-muted">{m.email}</p>
                   </div>
                 </div>
                 <TooltipProvider>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <button 
                         type="button"
                         className="flex size-8 items-center justify-center rounded-full border border-primary text-primary transition-colors hover:bg-primary hover:text-white"
                         onClick={() => { onAdd(m.id); setOpen(false); setSearch(""); }}
                       >
                         <UserPlus className="size-4" />
                       </button>
                     </TooltipTrigger>
                     <TooltipContent>Add {type.toLowerCase()}</TooltipContent>
                   </Tooltip>
                 </TooltipProvider>
               </div>
             ))}
             {filtered.length === 0 && <p className="text-sm text-center text-app-muted py-4">No {type.toLowerCase()}s found.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
