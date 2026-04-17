import { useState, useEffect } from 'react';
import { PixelButton } from '~/components/PixelButton';
import { FormInput } from '~/components/FormInput';
import { StatusBanner } from '~/components/StatusBanner';
import { SectionHeader } from '~/components/SectionHeader';
import { useValidateInviteCode } from '~/hooks/usePlayers';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import type { WizardState } from './JoinWizard';

interface StepInviteCodeProps {
  initialCode?: string;
  wizardState: WizardState;
  onValidated: (campaignId: string, campaignName: string) => void;
}

export function StepInviteCode({ initialCode, wizardState, onValidated }: StepInviteCodeProps) {
  const [code, setCode] = useState(initialCode ?? '');
  const [validated, setValidated] = useState<{
    campaignId: string;
    name: string;
    description: string;
  } | null>(null);

  const { validate, isLoading, error } = useValidateInviteCode();

  // If we already have a campaignId from a previous visit, show it as validated
  useEffect(() => {
    if (wizardState.campaignId && wizardState.campaignName) {
      setValidated({
        campaignId: wizardState.campaignId,
        name: wizardState.campaignName,
        description: '',
      });
    }
  }, [wizardState.campaignId, wizardState.campaignName]);

  async function handleValidate() {
    const trimmed = code.trim();
    if (!trimmed) return;
    const result = await validate({ inviteCode: trimmed });
    if (result) {
      setValidated(result);
    }
  }

  return (
    <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden">
      <div className="p-8 pb-6">
        <SectionHeader size="xs" tracking="tracking-[3px]" className="mb-7">
          INVITE CODE
        </SectionHeader>

        {!validated ? (
          <div className="space-y-5">
            <FormInput
              label="Enter your invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. ABCD-EFGH"
              disabled={isLoading}
            />

            {error && <StatusBanner variant="error" message={error} />}

            <PixelButton
              variant="primary"
              size="md"
              icon={<KeyRound className="h-3.5 w-3.5" />}
              onClick={handleValidate}
              disabled={isLoading || !code.trim()}
              type="button"
            >
              {isLoading ? 'Validating...' : 'Validate Code'}
            </PixelButton>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">{validated.name}</p>
                {validated.description && (
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {validated.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <PixelButton
                variant="secondary"
                size="md"
                onClick={() => setValidated(null)}
                type="button"
              >
                Try Different Code
              </PixelButton>
              <PixelButton
                variant="primary"
                size="md"
                onClick={() => onValidated(validated.campaignId, validated.name)}
                type="button"
              >
                Join this Campaign &rarr;
              </PixelButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
