export interface CatchUpContent {
  title: string
  content: string
  lastUpdated: string
}

export function getCatchUpContent(): CatchUpContent {
  return {
    title: 'Session Catch-Up',
    lastUpdated: '2026-03-22',
    content: `# Session 14 — The Shattered Vault

## Where We Left Off

The party descended into the **Sunken District** after following the trail of corrupted ward-stones left by the Ashen Compact. Brother Aldric was gravely wounded and left in the care of the Thornhollow healers.

## Key Events

### The Ambush at Corruth's Gate
- Mira triggered a **shadow-glyph trap** near the east archway, drawing three wraith-stalkers
- Theron held the chokepoint while Sable and Dex flanked through the collapsed aqueduct
- The wraith-stalkers were bound — not destroyed — suggesting someone is still maintaining the wards

### The Vault Beneath the Scriptorium
The party discovered an antechamber sealed with a **triple-lock mechanism**:
1. Blood-lock — opened using Sable's sigil fragment
2. Cipher wheel — solved by Dex after two failed attempts (Mira nearly lost a finger)
3. Voice-seal — still unsolved; requires a specific phrase in Old Vareth

Inside, they found **three items of note**:
- A cracked phylactery leaking grey smoke
- Correspondence between **Councillor Veth** and someone called *the Hollow Voice*
- A child's drawing depicting the Thornhollow bell tower in flames

### The Escape
Wards in the vault activated when Theron touched the phylactery. The party fled through the sewer tunnels as the ceiling collapsed. They emerged near the **Dye-Worker's Quarter** at dusk, tailed by at least one unseen presence.

## Unresolved Threads

- Who or what is **the Hollow Voice**?
- The voice-seal phrase is still needed to fully open the vault
- Councillor Veth has not been seen since the Council session three days ago
- The cracked phylactery is in Mira's pack — and it hummed once during the night watch

## Party Status

| Character | HP | Conditions |
|-----------|-----|------------|
| Theron | 24/40 | Exhausted (1) |
| Mira | 31/31 | — |
| Sable | 18/26 | Cursed (minor) |
| Dex | 28/28 | — |

> *"The Compact doesn't seal things away to protect them. They seal things away to protect themselves from them."*
> — Mira, after reading the correspondence`,
  }
}
