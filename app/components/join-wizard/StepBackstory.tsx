import { PixelButton } from '~/components/PixelButton';
import { MarkdownEditor } from '~/components/shared/MarkdownEditor';
import { SectionHeader } from '~/components/SectionHeader';
import { ShieldAlert } from 'lucide-react';

interface StepBackstoryProps {
  backstory: string;
  onUpdate: (backstory: string) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function StepBackstory({ backstory, onUpdate, onNext, onSkip, onBack }: StepBackstoryProps) {
  return (
    <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden">
      <div className="p-8 pb-6 space-y-5">
        <SectionHeader size="xs" tracking="tracking-[3px]" className="mb-7">
          BACKSTORY
        </SectionHeader>

        {/* Privacy banner */}
        <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <ShieldAlert className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            Only you and the Game Master can see your backstory. Other players will not have access
            to this information.
          </p>
        </div>

        <MarkdownEditor
          label="Character Backstory"
          value={backstory}
          onChange={onUpdate}
          placeholder="Write your character's backstory here... What shaped them? What drives them?"
          minHeight="240px"
          id="join-backstory-editor"
        />

        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors font-medium"
        >
          Skip for now &rarr;
        </button>
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between px-8 py-5 border-t border-white/[0.06]">
        <PixelButton variant="secondary" size="sm" onClick={onBack} type="button">
          &larr; Back
        </PixelButton>
        <PixelButton variant="primary" size="sm" onClick={onNext} type="button">
          Next: Related Characters &rarr;
        </PixelButton>
      </div>
    </div>
  );
}
