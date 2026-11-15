import { Gift, ListChecks, Trophy } from "lucide-react";
import { formatReferralPoints, type MyReferralSummary } from "@nexa-chess/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormattedText } from "@/components/ui/FormattedText";
import { SectionCard } from "@/components/ui/SectionCard";
import { money } from "../lib/referralFormat";

/** What this referrer earns at each stage, the bonuses, what their friend gets, and the terms. */
export function HowItWorks({ summary }: { summary: MyReferralSummary }) {
  const amount = (value: number) => (summary.wallet === "POINTS" ? formatReferralPoints(value) : money(value, summary.currency));
  const mine = summary.earnings.filter((row) => row.referrer > 0);
  const friend = summary.earnings.filter((row) => row.friendPoints > 0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
      <div className="grid gap-5">
        <SectionCard description="What the academy gives you for each referral, step by step." title="How you earn">
          {mine.length || summary.bonuses.length ? (
            <ul className="grid gap-3">
              {mine.map((row) => (
                <li className="flex items-start gap-3 rounded-control border border-app-border bg-app-soft p-3" key={row.stageId}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                    <Gift aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  </span>
                  <p className="min-w-0 font-bold text-app-text">
                    {amount(row.referrer)}{" "}
                    <span className="font-normal text-app-muted">for each referral that reaches &ldquo;{row.stageName}&rdquo;</span>
                  </p>
                </li>
              ))}
              {summary.bonuses.map((bonus) => (
                <li className="flex items-start gap-3 rounded-control border border-app-border bg-app-soft p-3" key={bonus.id}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                    <Trophy aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-app-text">
                      {amount(bonus.amount)}{" "}
                      <span className="font-normal text-app-muted">
                        bonus every {bonus.everyCount} referrals that reach &ldquo;{bonus.stageName}&rdquo;
                      </span>
                    </p>
                    <p className="text-sm text-app-muted">{bonus.description ?? bonus.name}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState description="The academy hasn't set up rewards yet." icon={Gift} title="No rewards yet" variant="inline" />
          )}
        </SectionCard>
        {friend.length ? (
          <SectionCard description="Tell them — it helps them say yes." title="What your friend gets">
            <ul className="grid gap-2 text-sm text-app-text">
              {friend.map((row) => (
                <li key={row.stageId}>
                  <span className="font-bold">{formatReferralPoints(row.friendPoints)}</span> when they reach &ldquo;{row.stageName}&rdquo;
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>

      <SectionCard title="Steps">
        <ol className="grid gap-3 text-sm text-app-text">
          <li>1. Share your link or code with someone who&rsquo;d enjoy chess classes.</li>
          <li>2. They open it and book a free demo class. You see each step on your board.</li>
          <li>3. When they join the academy, the academy marks them as onboarded.</li>
          <li>
            {summary.wallet === "POINTS"
              ? "4. You earn points at each step. Spend them in the rewards store on fee discounts or free days."
              : "4. You earn money at each step, and can withdraw it once it reaches the minimum."}
          </li>
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
