import { useState, useCallback, useId } from 'react';
import { PixelButton } from '~/components/PixelButton';
import { FormInput } from '~/components/FormInput';
import { MarkdownEditor } from '~/components/shared/MarkdownEditor';
import { ColorPicker } from '~/components/shared/ColorPicker';
import { ImageCropInput } from '~/components/wiki/characters/ImageCropInput';
import { SectionHeader } from '~/components/SectionHeader';
import { StatusBanner } from '~/components/StatusBanner';
import { useRaces } from '~/hooks/useRaces';
import { uploadToR2 } from '~/utils/uploadToR2';
import { compressImage } from '~/utils/compressImage';
import type { WizardPlayerState } from './JoinWizard';

interface StepPlayerInfoProps {
  player: WizardPlayerState;
  campaignId: string;
  onUpdate: (partial: Partial<WizardPlayerState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepPlayerInfo({
  player,
  campaignId,
  onUpdate,
  onNext,
  onBack,
}: StepPlayerInfoProps) {
  const raceDatalistId = useId();
  const { races } = useRaces(campaignId, { enabled: !!campaignId });
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    race?: string;
    characterClass?: string;
    age?: string;
    color?: string;
    link?: string;
  }>({});

  const handleUpload = useCallback(async (file: File): Promise<string> => {
    const compressed = await compressImage(file);
    const { publicUrl } = await uploadToR2(compressed, 'uploads/players');
    return publicUrl;
  }, []);

  function validate(): boolean {
    const errors: {
      firstName?: string;
      lastName?: string;
      race?: string;
      characterClass?: string;
      age?: string;
      color?: string;
      link?: string;
    } = {};
    if (!player.firstName.trim()) errors.firstName = 'First name is required';
    if (!player.lastName.trim()) errors.lastName = 'Last name is required';
    if (!player.race.trim()) errors.race = 'Race is required';
    if (!player.characterClass.trim()) errors.characterClass = 'Class is required';
    if (!player.age || player.age <= 0) errors.age = 'Age must be a positive number';
    if (player.color && !/^#[0-9a-fA-F]{6}$/.test(player.color)) errors.color = 'Invalid color';
    if (player.link.trim() && !/^https?:\/\/.+/.test(player.link.trim())) {
      errors.link = 'Must be a valid HTTP or HTTPS URL';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleNext() {
    if (validate()) onNext();
  }

  return (
    <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden">
      <div className="p-8 pb-6 space-y-5">
        <SectionHeader size="xs" tracking="tracking-[3px]" className="mb-7">
          YOUR CHARACTER
        </SectionHeader>

        {Object.keys(fieldErrors).length > 0 && (
          <StatusBanner variant="error" message="Please fix the errors below before continuing." />
        )}

        {/* Picture upload */}
        <ImageCropInput
          imageUrl={player.picture}
          crop={player.pictureCrop}
          onImageChange={(url) => onUpdate({ picture: url })}
          onCropChange={(crop) => onUpdate({ pictureCrop: crop })}
          onUpload={handleUpload}
        />

        {/* Color picker */}
        <ColorPicker
          label="Player Color"
          value={player.color}
          onChange={(color) => onUpdate({ color })}
        />

        {/* First Name + Last Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormInput
            label="First Name"
            value={player.firstName}
            onChange={(e) => onUpdate({ firstName: e.target.value })}
            error={fieldErrors.firstName}
            required
            placeholder="First name"
          />
          <FormInput
            label="Last Name"
            value={player.lastName}
            onChange={(e) => onUpdate({ lastName: e.target.value })}
            error={fieldErrors.lastName}
            required
            placeholder="Last name"
          />
        </div>

        {/* Race + Class + Age */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <FormInput
              label="Race"
              value={player.race}
              onChange={(e) => onUpdate({ race: e.target.value })}
              error={fieldErrors.race}
              required
              placeholder="e.g. Half-Elf"
              list={raceDatalistId}
            />
            <datalist id={raceDatalistId}>
              {races.map((r) => (
                <option key={r.id} value={r.title} />
              ))}
            </datalist>
          </div>
          <FormInput
            label="Class"
            value={player.characterClass}
            onChange={(e) => onUpdate({ characterClass: e.target.value })}
            error={fieldErrors.characterClass}
            required
            placeholder="e.g. Ranger / Druid"
          />
          <FormInput
            label="Age"
            type="number"
            value={player.age != null ? String(player.age) : ''}
            onChange={(e) =>
              onUpdate({ age: e.target.value ? parseInt(e.target.value, 10) : null })
            }
            error={fieldErrors.age}
            required
            placeholder="Age"
          />
        </div>

        {/* Gender + Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormInput
            label="Gender"
            value={player.gender}
            onChange={(e) => onUpdate({ gender: e.target.value })}
            placeholder="Gender"
          />
          <FormInput
            label="Location"
            value={player.location}
            onChange={(e) => onUpdate({ location: e.target.value })}
            placeholder="Current residence"
          />
        </div>

        {/* Eye Color + Hair Color */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormInput
            label="Eye Color"
            value={player.eyeColor}
            onChange={(e) => onUpdate({ eyeColor: e.target.value })}
            placeholder="e.g. Blue"
          />
          <FormInput
            label="Hair Color"
            value={player.hairColor}
            onChange={(e) => onUpdate({ hairColor: e.target.value })}
            placeholder="e.g. Auburn"
          />
        </div>

        {/* Height + Weight + Size */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <FormInput
            label="Height"
            value={player.height}
            onChange={(e) => onUpdate({ height: e.target.value })}
            placeholder={`e.g. 5'10"`}
          />
          <FormInput
            label="Weight"
            type="number"
            value={player.weight != null ? String(player.weight) : ''}
            onChange={(e) =>
              onUpdate({ weight: e.target.value ? parseInt(e.target.value, 10) : null })
            }
            placeholder="lbs"
          />
          <FormInput
            label="Size"
            value={player.size}
            onChange={(e) => onUpdate({ size: e.target.value })}
            placeholder="e.g. Medium"
          />
        </div>

        {/* External Link */}
        <FormInput
          label="External Link"
          type="url"
          value={player.link}
          onChange={(e) => onUpdate({ link: e.target.value })}
          error={fieldErrors.link}
          placeholder="https://..."
        />

        {/* Description */}
        <MarkdownEditor
          label="Description"
          value={player.description}
          onChange={(v) => onUpdate({ description: v })}
          placeholder="A brief description of this player character..."
          minHeight="120px"
          id="join-player-description-editor"
        />

        {/* Appearance */}
        <MarkdownEditor
          label="Appearance"
          value={player.appearance}
          onChange={(v) => onUpdate({ appearance: v })}
          placeholder="Physical appearance details..."
          minHeight="120px"
          id="join-player-appearance-editor"
        />
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between px-8 py-5 border-t border-white/[0.06]">
        <PixelButton variant="secondary" size="sm" onClick={onBack} type="button">
          &larr; Back
        </PixelButton>
        <PixelButton variant="primary" size="sm" onClick={handleNext} type="button">
          Next: Backstory &rarr;
        </PixelButton>
      </div>
    </div>
  );
}
