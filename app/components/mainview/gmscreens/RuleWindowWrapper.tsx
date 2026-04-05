import { Pencil } from 'lucide-react';
import { RuleWindow } from '~/components/wiki/rules/RuleWindow';
import { RuleModal } from '~/components/wiki/rules/RuleModal';
import { useRule } from '~/hooks/useRules';

export function EditRuleModalWrapper({
  campaignId,
  ruleId,
  onClose,
}: {
  campaignId: string;
  ruleId: string;
  onClose: () => void;
}) {
  return <RuleModal isOpen onClose={onClose} campaignId={campaignId} ruleId={ruleId} />;
}

export function RuleWindowWrapper({
  ruleId,
  campaignId,
  isGM,
  onEdit,
}: {
  ruleId: string;
  campaignId: string;
  isGM: boolean;
  onEdit: () => void;
}) {
  const { rule, isLoading } = useRule(ruleId, campaignId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading rule...</p>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Rule not found</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {isGM && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
          aria-label="Edit rule"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <RuleWindow rule={rule} />
    </div>
  );
}
