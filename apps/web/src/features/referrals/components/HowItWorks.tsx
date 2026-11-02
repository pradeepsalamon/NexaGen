import { Gift, ListChecks } from "lucide-react";
import { formatReferralReward, type MyReferralSummary } from "@nexa-chess/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormattedText } from "@/components/ui/FormattedText";
import { SectionCard } from "@/components/ui/SectionCard";

type Rule = MyReferralSummary["rules"][number];

function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ul className="grid gap-3">
      {rules.map((rule) => (
        <li className="flex items-start gap-3 rounded-control border border-app-border bg-app-soft p-3" key={rule.id}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
            <Gift aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-app-text">
              {formatReferralReward(rule.amountMinor, rule.unit, rule.currency)}{" "}
              <span className="font-normal text-app-muted">
                {rule.beneficiary === "REFERRED"
                  ? `${rule.unit === "DISCOUNT_PERCENT" ? "one payment" : ""} when they reach "${rule.stageName}"`.trim()
                  : rule.kind === "MILESTONE"
                    ? `for every ${rule.milestoneCount} referrals that reach "${rule.stageName}"`
                    : `for each referral that reaches "${rule.stageName}"`}
              </span>
            </p>
            <p className="text-sm text-app-muted">{rule.description ?? rule.name}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The reward rules this referrer can earn from, what their friend gets, and the terms. */
export function HowItWorks({ summary }: { summary: MyReferralSummary }) {
  const referrerRules = summary.rules.filter((rule) => rule.beneficiary === "REFERRER");
  const friendRules = summary.rules.filter((rule) => rule.beneficiary === "REFERRED");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
      <div className="grid gap-5">
        <SectionCard description="What the academy gives you for each step." title="How you earn">
          {referrerRules.length ? (
            <RuleList rules={referrerRules} />
          ) : (
            <EmptyState description="The academy hasn't set up rewards yet." icon={Gift} title="No rewards yet" variant="inline" />
          )}
        </SectionCard>
        {friendRules.length ? (
          <SectionCard description="Tell them — it helps them say yes." title="What your friend gets">
            <RuleList rules={friendRules} />
          </SectionCard>
        ) : null}
      </div>

      <SectionCard title="Steps">
        <ol className="grid gap-3 text-sm text-app-text">
          <li>1. Share your link or code with someone who’d enjoy chess classes.</li>
          <li>2. They open it and book a free demo class. You see each step on your board.</li>
          <li>3. When they join the academy, the academy marks them as onboarded.</li>
          <li>4. Rewards land in your wallet as money or points. Points can be sent to other members or converted to money.</li>
        </ol>
        {summary.programTerms ? (
          <div className="mt-4 border-t border-app-border pt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-app-text">
              <ListChecks aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Programme terms
            </p>
            <FormattedText className="text-sm text-app-muted" source={summary.programTerms} />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
