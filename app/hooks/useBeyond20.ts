import { useEffect, useState, useCallback, useRef } from 'react';
import { captureEvent } from '~/utils/posthog-client';

interface Beyond20Roll {
  action: string;
  request: {
    type: string;
  };
  title: string;
  character: string;
  source: string;
  description?: string;
  whisper: number;
  attack_rolls: Array<{
    total: number;
    formula?: string;
    parts?: unknown[];
    'critical-success'?: boolean;
    'critical-failure'?: boolean;
    discarded?: boolean;
  }>;
  damage_rolls: Array<
    [
      string,
      {
        total: number;
        formula?: string;
        parts?: unknown[];
        dice?: Array<{ faces: number; value: number }>;
      },
      number,
    ]
  >;
  total_damages: Record<string, { total: number; formula?: string }>;
  roll_info: Array<[string, string]>;
}

export interface ParsedDiceRoll {
  character: string;
  title: string;
  rollType: string;
  attackRolls: Array<{
    roll: number;
    type: 'hit' | 'crit' | 'miss' | 'crit-fail';
    total: number;
  }>;
  damageRolls: Array<{
    damageType: string;
    dice: number[];
    total: number;
    flags: number;
  }>;
  totalDamages: Record<string, number>;
  rollInfo: Array<[string, string]>;
  description: string;
  channel: 'general' | 'gm';
}

export interface ParsedSpellCard {
  character: string;
  title: string;
  source: string;
  description: string;
  properties: Record<string, string>;
  channel: 'general' | 'gm';
}

function mapWhisperToChannel(whisper: number): 'general' | 'gm' {
  return whisper === 1 || whisper === 3 ? 'gm' : 'general';
}

function classifyAttackRoll(
  roll: Beyond20Roll['attack_rolls'][number]
): 'hit' | 'crit' | 'miss' | 'crit-fail' {
  if (roll['critical-success']) return 'crit';
  if (roll['critical-failure']) return 'crit-fail';
  return 'hit';
}

function parseDiceRoll(raw: Beyond20Roll): ParsedDiceRoll {
  const attackRolls = raw.attack_rolls
    .filter((r) => !r.discarded)
    .map((r) => ({
      roll: r.total,
      type: classifyAttackRoll(r),
      total: r.total,
    }));

  const damageRolls = raw.damage_rolls.map(([damageType, roll, flags]) => ({
    damageType,
    dice: roll.dice ? roll.dice.map((d) => d.value) : [],
    total: roll.total,
    flags: flags ?? 1,
  }));

  const totalDamages: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw.total_damages)) {
    totalDamages[key] = val.total;
  }

  return {
    character: raw.character,
    title: raw.title,
    rollType: raw.request.type,
    attackRolls,
    damageRolls,
    totalDamages,
    rollInfo: raw.roll_info ?? [],
    description: raw.description ?? '',
    channel: mapWhisperToChannel(raw.whisper),
  };
}

function parseSpellCard(raw: Beyond20Roll): ParsedSpellCard {
  const properties: Record<string, string> = {};
  if (raw.roll_info) {
    for (const [key, value] of raw.roll_info) {
      properties[key] = value;
    }
  }

  return {
    character: raw.character,
    title: raw.title,
    source: raw.source ?? '',
    description: raw.description ?? '',
    properties,
    channel: mapWhisperToChannel(raw.whisper),
  };
}

function hasDiceResults(raw: Beyond20Roll): boolean {
  return (raw.attack_rolls?.length ?? 0) > 0 || (raw.damage_rolls?.length ?? 0) > 0;
}

export function useBeyond20(
  onDiceRoll: (roll: ParsedDiceRoll) => void,
  onSpellCard: (card: ParsedSpellCard) => void
) {
  const [isConnected, setIsConnected] = useState(false);

  const onDiceRollRef = useRef(onDiceRoll);
  onDiceRollRef.current = onDiceRoll;
  const onSpellCardRef = useRef(onSpellCard);
  onSpellCardRef.current = onSpellCard;

  useEffect(() => {
    function handleLoaded() {
      console.info('[Beyond20] Loaded');
      setIsConnected(true);
      captureEvent('party.beyond20_connected', {});
    }

    function handleRenderedRoll(evt: Event) {
      const detail = (evt as CustomEvent).detail;
      const raw: Beyond20Roll = Array.isArray(detail) ? detail[0] : detail;

      if (!raw) return;

      if (hasDiceResults(raw)) {
        console.debug(
          `[Beyond20] Routed to dice type=${raw.request?.type} character=${raw.character} title=${raw.title}`
        );
        onDiceRollRef.current(parseDiceRoll(raw));
      } else {
        console.debug(
          `[Beyond20] Routed to chat type=${raw.request?.type} character=${raw.character} title=${raw.title}`
        );
        onSpellCardRef.current(parseSpellCard(raw));
      }
    }

    document.addEventListener('Beyond20_Loaded', handleLoaded);
    document.addEventListener('Beyond20_RenderedRoll', handleRenderedRoll);

    return () => {
      document.removeEventListener('Beyond20_Loaded', handleLoaded);
      document.removeEventListener('Beyond20_RenderedRoll', handleRenderedRoll);
    };
  }, []);

  return { isConnected };
}
